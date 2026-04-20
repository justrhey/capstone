//! EXT-4: FHIR / HL7 outbound integration (MVP).
//!
//! We already build a FHIR R4 Bundle in
//! `services/export_service::build_export_for_user` for CMP-2
//! data-portability export.
//!
//! This endpoint reuses that builder to stage a Bundle for an *outbound push*
//! to another FHIR server. Because the capstone has no partner endpoint to
//! integration-test against, we intentionally do NOT perform the network call
//! here — that would either (a) be untested dead code, or (b) invite SSRF
//! pivots. Instead we return the Bundle plus a ready-to-run `curl` command
//! so the integrator can paste it into a terminal and audit the transfer
//! themselves. Production would move this behind an outbox + retry worker.

use actix_web::{post, web, HttpRequest, HttpResponse, Responder};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::services::audit_service::log_action;
use crate::services::auth_service::{require_role, AppError};
use crate::services::export_service::build_export_for_user;

#[derive(Debug, Deserialize)]
pub struct StagePushRequest {
    pub patient_id: Uuid,
    pub endpoint: String,
}

#[post("/api/fhir/stage-push")]
async fn stage_push(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<StagePushRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;
    let b = body.into_inner();

    if !(b.endpoint.starts_with("https://") || b.endpoint.starts_with("http://")) {
        return Err(AppError::BadRequest("endpoint must be http(s)://".into()));
    }

    // Find the patient's linked user_id (the export builder is keyed by user_id).
    let user_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM patients WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(b.patient_id)
    .fetch_optional(pool.get_ref())
    .await?;
    let user_id =
        user_id.ok_or_else(|| AppError::NotFound("Patient has no linked user".into()))?;

    let bundle = build_export_for_user(pool.get_ref(), user_id, config.get_ref()).await?;
    let body_json = serde_json::to_string(&bundle)
        .map_err(|e| AppError::InternalError(format!("serialize: {}", e)))?;

    log_action(
        &pool,
        claims.sub,
        "fhir_push_staged",
        Some("fhir_push"),
        Some(b.patient_id),
        &req,
    )
    .await;

    // Generate a curl command the integrator can audit before running.
    let curl_cmd = format!(
        "curl -X POST '{}' \\\n  -H 'Content-Type: application/fhir+json' \\\n  -H 'Authorization: Bearer <TOKEN>' \\\n  --data-binary @bundle.json",
        b.endpoint.replace('\'', "'\\''")
    );

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "endpoint": b.endpoint,
        "bytes": body_json.len(),
        "bundle": bundle,
        "curl": curl_cmd,
        "note": "The server does NOT perform the outbound call — paste `curl` to audit and push yourself."
    })))
}

pub fn fhir_outbound_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(stage_push);
}
