use actix_web::{get, post, put, web, HttpRequest, HttpResponse, Responder};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::services::audit_service::log_action;
use crate::services::auth_service::{require_claims, require_role, AppError};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Problem {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub code: Option<String>,
    pub description: String,
    pub status: String,
    pub onset_at: Option<NaiveDate>,
    pub resolved_at: Option<NaiveDate>,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProblemRequest {
    pub patient_id: Uuid,
    pub code: Option<String>,
    pub description: String,
    pub onset_at: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProblemRequest {
    pub status: Option<String>,
    pub resolved_at: Option<NaiveDate>,
    pub description: Option<String>,
    pub code: Option<String>,
}

async fn patient_is_owned_by(pool: &PgPool, patient_id: Uuid, user_id: Uuid) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)",
    )
    .bind(patient_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

/// List a patient's problems. Visible to staff; patients see only their own.
#[get("/api/patients/{id}/problems")]
async fn list_problems(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let patient_id = path.into_inner();

    if claims.role == "patient"
        && !patient_is_owned_by(pool.get_ref(), patient_id, claims.sub).await
    {
        return Err(AppError::Forbidden("Not your record".into()));
    }

    let rows = sqlx::query_as::<_, Problem>(
        "SELECT * FROM problems WHERE patient_id = $1 \
         ORDER BY (status = 'active') DESC, created_at DESC",
    )
    .bind(patient_id)
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(rows))
}

#[post("/api/problems")]
async fn create_problem(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateProblemRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let b = body.into_inner();
    if b.description.trim().is_empty() {
        return Err(AppError::BadRequest("description is required".into()));
    }
    let row = sqlx::query_as::<_, Problem>(
        "INSERT INTO problems (patient_id, code, description, onset_at, created_by) \
         VALUES ($1, $2, $3, $4, $5) RETURNING *",
    )
    .bind(b.patient_id)
    .bind(b.code)
    .bind(b.description)
    .bind(b.onset_at)
    .bind(claims.sub)
    .fetch_one(pool.get_ref())
    .await?;

    log_action(&pool, claims.sub, "problem_added", Some("problem"), Some(row.id), &req).await;
    Ok(HttpResponse::Created().json(row))
}

#[put("/api/problems/{id}")]
async fn update_problem(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<UpdateProblemRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let id = path.into_inner();
    let b = body.into_inner();

    if let Some(s) = b.status.as_deref() {
        if !matches!(s, "active" | "resolved" | "inactive") {
            return Err(AppError::BadRequest("status must be active|resolved|inactive".into()));
        }
    }

    // Pragma: partial update via COALESCE on whatever was provided.
    let row = sqlx::query_as::<_, Problem>(
        "UPDATE problems SET \
           status       = COALESCE($1, status), \
           resolved_at  = CASE WHEN $1 = 'resolved' THEN COALESCE($2, CURRENT_DATE) ELSE resolved_at END, \
           description  = COALESCE($3, description), \
           code         = COALESCE($4, code), \
           updated_at   = NOW() \
         WHERE id = $5 RETURNING *",
    )
    .bind(b.status.as_deref())
    .bind(b.resolved_at)
    .bind(b.description.as_deref())
    .bind(b.code.as_deref())
    .bind(id)
    .fetch_optional(pool.get_ref())
    .await?
    .ok_or_else(|| AppError::NotFound("Problem not found".into()))?;

    log_action(&pool, claims.sub, "problem_updated", Some("problem"), Some(id), &req).await;
    Ok(HttpResponse::Ok().json(row))
}

pub fn problem_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list_problems).service(create_problem).service(update_problem);
}
