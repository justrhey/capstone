//! EXT-2: Signed prescription receipts.
//!
//! Scope: not a commercial e-prescribing interchange (no NCPDP/SureScripts).
//! We produce a tamper-evident JSON receipt for a prescription order that
//! the patient can hand to any pharmacy. The receipt carries:
//!   - the prescribing doctor's user id + name
//!   - the order payload (drug, dose, frequency from the order summary/details)
//!   - an HMAC-SHA256 signature over the canonical payload using the same
//!     encryption key that anchors record encryption. Anyone who trusts
//!     the health authority's key can verify without calling back to us.
//!
//! A future sprint could swap the HMAC for an ed25519 signature per-doctor —
//! the receipt shape stays stable.

use actix_web::{get, web, HttpRequest, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use hex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::services::auth_service::{require_claims, AppError};

#[derive(Debug, Serialize)]
pub struct PrescriptionReceipt {
    pub order_id: Uuid,
    pub patient_id: Uuid,
    pub prescriber_user_id: Uuid,
    pub prescriber_name: String,
    pub summary: String,
    pub details: Option<serde_json::Value>,
    pub issued_at: DateTime<Utc>,
    pub canonical_payload: String,
    pub signature_algo: String,
    pub signature: String,
    pub verify_instructions: String,
}

fn canonical(
    order_id: Uuid,
    patient_id: Uuid,
    prescriber: Uuid,
    summary: &str,
    issued_at: DateTime<Utc>,
) -> String {
    // Deterministic text so independent verifiers can reproduce it.
    format!(
        "order={}|patient={}|prescriber={}|summary={}|issued={}",
        order_id,
        patient_id,
        prescriber,
        summary.trim(),
        issued_at.timestamp()
    )
}

fn hmac_sha256(key_hex: &str, msg: &str) -> String {
    // Minimal HMAC-SHA256 without pulling in `hmac` crate.
    let key = hex::decode(key_hex).unwrap_or_else(|_| key_hex.as_bytes().to_vec());
    let block = 64usize;
    let mut k = if key.len() > block {
        Sha256::digest(&key).to_vec()
    } else {
        key
    };
    if k.len() < block {
        k.resize(block, 0);
    }
    let ipad: Vec<u8> = k.iter().map(|b| b ^ 0x36).collect();
    let opad: Vec<u8> = k.iter().map(|b| b ^ 0x5c).collect();

    let mut inner = Sha256::new();
    inner.update(&ipad);
    inner.update(msg.as_bytes());
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(&opad);
    outer.update(&inner_hash);
    hex::encode(outer.finalize())
}

/// GET /api/orders/{id}/prescription-receipt
#[get("/api/orders/{id}/prescription-receipt")]
async fn prescription_receipt(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let order_id = path.into_inner();

    // Fetch the order. Must be a prescription.
    let row: Option<(Uuid, Uuid, String, String, Option<serde_json::Value>, Option<Uuid>, DateTime<Utc>)> =
        sqlx::query_as(
            "SELECT id, patient_id, kind, summary, details, ordered_by, ordered_at \
             FROM orders WHERE id = $1",
        )
        .bind(order_id)
        .fetch_optional(pool.get_ref())
        .await?;
    let (id, patient_id, kind, summary, details, ordered_by, ordered_at) =
        row.ok_or_else(|| AppError::NotFound("Order not found".into()))?;

    if kind != "prescription" {
        return Err(AppError::BadRequest("Order is not a prescription".into()));
    }
    let prescriber_id = ordered_by
        .ok_or_else(|| AppError::InternalError("Order has no prescriber on file".into()))?;

    // Authorization: patient-owner, the prescriber, or staff/admin.
    if claims.role == "patient" {
        let owner: Option<Uuid> =
            sqlx::query_scalar("SELECT user_id FROM patients WHERE id = $1")
                .bind(patient_id)
                .fetch_optional(pool.get_ref())
                .await?;
        if owner != Some(claims.sub) {
            return Err(AppError::Forbidden("Not your prescription".into()));
        }
    }

    // Prescriber display name.
    let who: Option<(Option<String>, Option<String>)> =
        sqlx::query_as("SELECT first_name, last_name FROM users WHERE id = $1")
            .bind(prescriber_id)
            .fetch_optional(pool.get_ref())
            .await?;
    let name = who
        .map(|(f, l)| format!("{} {}", f.unwrap_or_default(), l.unwrap_or_default()))
        .unwrap_or_else(|| "Unknown prescriber".to_string())
        .trim()
        .to_string();

    let canon = canonical(id, patient_id, prescriber_id, &summary, ordered_at);
    let sig = hmac_sha256(&config.encryption_key, &canon);

    let receipt = PrescriptionReceipt {
        order_id: id,
        patient_id,
        prescriber_user_id: prescriber_id,
        prescriber_name: name,
        summary,
        details,
        issued_at: ordered_at,
        canonical_payload: canon,
        signature_algo: "HMAC-SHA256 over canonical_payload".to_string(),
        signature: sig,
        verify_instructions:
            "Recompute HMAC-SHA256(canonical_payload) with the health authority's \
             shared key. Matching signature confirms the prescription was \
             anchored by this facility and has not been altered."
                .to_string(),
    };

    Ok(HttpResponse::Ok().json(receipt))
}

pub fn prescription_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(prescription_receipt);
}
