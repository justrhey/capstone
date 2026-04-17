use actix_web::{get, web, HttpRequest, HttpResponse, Responder};
use sqlx::PgPool;

use crate::config::Config;
use crate::services::auth_service::{require_role, AppError};
use crate::services::export_service::build_export_for_user;

/// CMP-2: HIPAA §164.524 / GDPR Art. 15–20 right of access. Returns a FHIR R4
/// Bundle containing the caller's Patient resource plus every Condition,
/// MedicationStatement, and AllergyIntolerance derived from their records.
///
/// Content-Type is `application/fhir+json` so downstream tools recognize it.
#[get("/api/me/export")]
async fn export_my_data(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["patient"])?;
    let bundle = build_export_for_user(pool.get_ref(), claims.sub, config.get_ref()).await?;

    Ok(HttpResponse::Ok()
        .content_type("application/fhir+json")
        .json(bundle))
}

pub fn export_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(export_my_data);
}
