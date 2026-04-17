use actix_web::{web, HttpResponse, Responder, get, post, HttpRequest};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::FromRow;
use uuid::Uuid;
use crate::services::auth_service::{require_claims, require_role, AppError};
use crate::services::blockchain_service::verify_record_hash;
use crate::config::Config;
use sqlx::PgPool;

#[derive(Debug, Deserialize)]
pub struct VerifyRequest {
    pub record_id: Uuid,
}

async fn verify_by_id(pool: &PgPool, config: &Config, record_id: Uuid) -> Result<HttpResponse, AppError> {
    let record_hash: Option<String> = sqlx::query_scalar(
        "SELECT record_hash FROM medical_records WHERE id = $1"
    )
        .bind(record_id)
        .fetch_optional(pool)
        .await?;

    let record_hash = record_hash.ok_or_else(|| AppError::NotFound("Record not found".into()))?;

    // verify_latest checks the hash against the *current* active version on-chain
    // for this specific record_id. An adversary who edits the DB without anchoring
    // a new version will fail verification because the DB hash no longer matches
    // the on-chain active version.
    let chain_result = verify_record_hash(pool, &record_id.to_string(), &record_hash, config).await;
    let (blockchain_verified, status) = match chain_result {
        Some(true) => (true, "intact"),
        Some(false) => (false, "tampered"),
        None => (false, "unavailable"),
    };

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "record_id": record_id,
        "record_hash": record_hash,
        "blockchain_verified": blockchain_verified,
        "status": status,
    })))
}

#[get("/api/records/{id}/verify")]
async fn verify_record(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    require_claims(&req)?;
    verify_by_id(pool.get_ref(), config.get_ref(), path.into_inner()).await
}

#[post("/api/verify")]
async fn verify(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<VerifyRequest>,
) -> Result<impl Responder, AppError> {
    require_claims(&req)?;
    verify_by_id(pool.get_ref(), config.get_ref(), body.record_id).await
}

#[derive(Debug, FromRow)]
struct RecordHashRow {
    id: Uuid,
    patient_id: Uuid,
    record_hash: String,
    created_at: DateTime<Utc>,
}

/// Admin/auditor view: scans every record and returns those whose on-chain
/// latest version no longer matches the DB hash. A populated list indicates
/// that someone altered the DB without a corresponding contract update.
///
/// Note: this is O(records × one CLI call) — acceptable at capstone scale.
/// A production deployment should batch via a contract read or denormalize.
#[get("/api/records/tampered")]
async fn list_tampered(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["admin", "auditor"])?;

    let rows = sqlx::query_as::<_, RecordHashRow>(
        "SELECT id, patient_id, record_hash, created_at FROM medical_records ORDER BY created_at DESC",
    )
    .fetch_all(pool.get_ref())
    .await?;

    let mut tampered: Vec<serde_json::Value> = Vec::new();
    let mut chain_unreachable = false;
    for row in rows {
        match verify_record_hash(pool.get_ref(), &row.id.to_string(), &row.record_hash, config.get_ref()).await {
            Some(false) => tampered.push(serde_json::json!({
                "record_id": row.id,
                "patient_id": row.patient_id,
                "record_hash": row.record_hash,
                "created_at": row.created_at,
            })),
            None => { chain_unreachable = true; }
            Some(true) => {}
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "tampered": tampered,
        "count": tampered.len(),
        "chain_unreachable": chain_unreachable,
    })))
}

pub fn verify_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(verify_record).service(verify).service(list_tampered);
}