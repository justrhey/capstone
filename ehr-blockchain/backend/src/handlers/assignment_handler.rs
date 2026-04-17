use actix_web::{get, post, delete, web, HttpRequest, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::services::auth_service::{require_role, AppError};
use crate::services::audit_service::log_action;

#[derive(Debug, Serialize, FromRow)]
pub struct AssignmentRow {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub staff_user_id: Uuid,
    pub assigned_at: DateTime<Utc>,
    pub assigned_by: Option<Uuid>,
    pub removed_at: Option<DateTime<Utc>>,
    pub staff_email: Option<String>,
    pub staff_first_name: Option<String>,
    pub staff_last_name: Option<String>,
    pub staff_role: Option<String>,
    pub patient_first_name: Option<String>,
    pub patient_last_name: Option<String>,
}

#[get("/api/assignments")]
async fn list_assignments(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["admin"])?;
    // Names are encrypted at rest. For a quick admin view we return raw
    // (encrypted) names; the frontend will call /api/patients/:id if it needs
    // plaintext. This keeps the endpoint cheap.
    let rows = sqlx::query_as::<_, AssignmentRow>(
        "SELECT a.id, a.patient_id, a.staff_user_id, a.assigned_at, a.assigned_by, a.removed_at, \
                u.email AS staff_email, u.first_name AS staff_first_name, u.last_name AS staff_last_name, u.role AS staff_role, \
                p.first_name AS patient_first_name, p.last_name AS patient_last_name \
         FROM patient_assignments a \
         LEFT JOIN users u ON u.id = a.staff_user_id \
         LEFT JOIN patients p ON p.id = a.patient_id \
         ORDER BY (a.removed_at IS NULL) DESC, a.assigned_at DESC \
         LIMIT 500",
    )
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(rows))
}

#[derive(Debug, Deserialize)]
pub struct CreateAssignmentBody {
    pub patient_id: Uuid,
    pub staff_user_id: Uuid,
}

#[post("/api/assignments")]
async fn create_assignment(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateAssignmentBody>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO patient_assignments (patient_id, staff_user_id, assigned_by) \
         VALUES ($1, $2, $3) \
         ON CONFLICT (patient_id, staff_user_id) WHERE removed_at IS NULL DO UPDATE SET assigned_at = EXCLUDED.assigned_at \
         RETURNING id",
    )
    .bind(body.patient_id)
    .bind(body.staff_user_id)
    .bind(claims.sub)
    .fetch_one(pool.get_ref())
    .await?;

    log_action(
        &pool,
        claims.sub,
        "assignment_created",
        Some("assignment"),
        Some(id),
        &req,
    )
    .await;

    Ok(HttpResponse::Created().json(serde_json::json!({ "id": id })))
}

#[delete("/api/assignments/{id}")]
async fn delete_assignment(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;
    let id = path.into_inner();
    let result = sqlx::query(
        "UPDATE patient_assignments SET removed_at = NOW(), removed_by = $1 \
         WHERE id = $2 AND removed_at IS NULL",
    )
    .bind(claims.sub)
    .bind(id)
    .execute(pool.get_ref())
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Active assignment not found".into()));
    }
    log_action(&pool, claims.sub, "assignment_removed", Some("assignment"), Some(id), &req).await;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "removed": id })))
}

pub fn assignment_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list_assignments)
        .service(create_assignment)
        .service(delete_assignment);
}
