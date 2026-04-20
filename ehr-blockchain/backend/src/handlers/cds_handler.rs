use actix_web::{post, web, HttpRequest, HttpResponse, Responder};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::services::auth_service::{require_role, AppError};
use crate::services::cds_service::screen;
use crate::services::encryption::decrypt_field_opt;
use crate::config::Config;

#[derive(Debug, Deserialize)]
pub struct CdsCheckRequest {
    pub patient_id: Uuid,
    pub new_meds: Vec<String>,
}

/// OPS-2: given a proposed list of new medications for a patient, surface
/// allergy + drug-interaction warnings against the patient's existing meds
/// (from their records) and documented allergies.
#[post("/api/cds/check")]
async fn cds_check(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<CdsCheckRequest>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["doctor", "nurse"])?;
    let b = body.into_inner();

    // Existing meds: every medication row across the patient's records.
    let existing: Vec<String> = sqlx::query_scalar::<_, String>(
        "SELECT m.name FROM medications m \
         JOIN medical_records r ON r.id = m.record_id \
         WHERE r.patient_id = $1",
    )
    .bind(b.patient_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    // Allergies: stored encrypted at the allergen column. Fetch and decrypt.
    let enc_allergies: Vec<Option<String>> = sqlx::query_scalar::<_, Option<String>>(
        "SELECT a.allergen FROM allergies a \
         JOIN medical_records r ON r.id = a.record_id \
         WHERE r.patient_id = $1",
    )
    .bind(b.patient_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();
    let allergies: Vec<String> = enc_allergies
        .into_iter()
        .filter_map(|a| decrypt_field_opt(&a, &config.encryption_key))
        .filter(|s| !s.is_empty())
        .collect();

    let alerts = screen(&b.new_meds, &existing, &allergies);
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "alerts": alerts,
        "checked_against": {
            "existing_meds": existing.len(),
            "allergies": allergies.len(),
        }
    })))
}

pub fn cds_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(cds_check);
}
