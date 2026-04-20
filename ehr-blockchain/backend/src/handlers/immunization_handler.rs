use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::services::audit_service::log_action;
use crate::services::auth_service::{require_claims, require_role, AppError};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Immunization {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub vaccine: String,
    pub dose_number: Option<i32>,
    pub administered_on: NaiveDate,
    pub administered_by: Option<Uuid>,
    pub manufacturer: Option<String>,
    pub lot_number: Option<String>,
    pub site: Option<String>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateImmunizationRequest {
    pub patient_id: Uuid,
    pub vaccine: String,
    pub dose_number: Option<i32>,
    pub administered_on: NaiveDate,
    pub manufacturer: Option<String>,
    pub lot_number: Option<String>,
    pub site: Option<String>,
    pub notes: Option<String>,
}

async fn patient_belongs_to_user(pool: &PgPool, patient_id: Uuid, user_id: Uuid) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)",
    )
    .bind(patient_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

#[get("/api/patients/{id}/immunizations")]
async fn list_immunizations(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let patient_id = path.into_inner();
    if claims.role == "patient"
        && !patient_belongs_to_user(pool.get_ref(), patient_id, claims.sub).await
    {
        return Err(AppError::Forbidden("Not your record".into()));
    }
    let rows = sqlx::query_as::<_, Immunization>(
        "SELECT * FROM immunizations WHERE patient_id = $1 ORDER BY administered_on DESC",
    )
    .bind(patient_id)
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(rows))
}

#[post("/api/immunizations")]
async fn create_immunization(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateImmunizationRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let b = body.into_inner();
    if b.vaccine.trim().is_empty() {
        return Err(AppError::BadRequest("vaccine is required".into()));
    }
    let row = sqlx::query_as::<_, Immunization>(
        "INSERT INTO immunizations (patient_id, vaccine, dose_number, administered_on, \
            administered_by, manufacturer, lot_number, site, notes) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
    )
    .bind(b.patient_id)
    .bind(b.vaccine.trim())
    .bind(b.dose_number)
    .bind(b.administered_on)
    .bind(claims.sub)
    .bind(b.manufacturer)
    .bind(b.lot_number)
    .bind(b.site)
    .bind(b.notes)
    .fetch_one(pool.get_ref())
    .await?;
    log_action(&pool, claims.sub, "immunization_added", Some("immunization"), Some(row.id), &req).await;
    Ok(HttpResponse::Created().json(row))
}

pub fn immunization_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list_immunizations).service(create_immunization);
}
