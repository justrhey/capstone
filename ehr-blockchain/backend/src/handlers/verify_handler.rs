use actix_web::{web, HttpResponse, Responder, get};
use uuid::Uuid;
use crate::services::auth_service::AppError;
use crate::services::blockchain_service::verify_record_hash;
use crate::config::Config;
use sqlx::PgPool;

#[get("/api/records/{id}/verify")]
async fn verify_record(
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let record_id = path.into_inner();

    let record_hash: Option<String> = sqlx::query_scalar(
        "SELECT record_hash FROM medical_records WHERE id = $1"
    )
        .bind(record_id)
        .fetch_optional(&**pool)
        .await?;

    let record_hash = record_hash.ok_or_else(|| AppError::NotFound("Record not found".into()))?;

    let config = Config::from_env().map_err(|e| AppError::InternalError(e.to_string()))?;
    let is_valid = verify_record_hash(&pool, &record_hash, &config).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "record_id": record_id,
        "record_hash": record_hash,
        "blockchain_verified": is_valid,
        "status": if is_valid { "intact" } else { "tampered" }
    })))
}

pub fn verify_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(verify_record);
}