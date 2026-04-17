use actix_web::{web, HttpResponse, Responder, get, HttpRequest};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::services::auth_service::{require_claims, require_role, AppError};
use crate::services::pagination::{Page, PageParams};

#[derive(Debug, Serialize, FromRow)]
pub struct AuditLog {
    pub id: Uuid,
    pub user_id: Uuid,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<Uuid>,
    pub ip_address: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[get("/api/audit/logs")]
async fn list_audit_logs(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    params: web::Query<PageParams>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["admin", "auditor"])?;
    let page = Page::from_params(&params);
    let logs = sqlx::query_as::<_, AuditLog>(
        "SELECT id, user_id, action, resource_type, resource_id, ip_address, created_at \
         FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    )
    .bind(page.limit)
    .bind(page.offset)
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(logs))
}

/// Patient-facing access history. Returns audit events that affected data
/// owned by the caller — their patient profile, their records, or access
/// grants they issued. CMP-6: `ip_address` is intentionally excluded from this
/// projection so it is never leaked to a data subject.
#[derive(Debug, Serialize, FromRow)]
pub struct PatientAuditRow {
    pub id: Uuid,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub blockchain_timestamp: Option<i64>,
    pub actor_id: Uuid,
    pub actor_first_name: Option<String>,
    pub actor_last_name: Option<String>,
    pub actor_role: Option<String>,
}

#[get("/api/me/audit-history")]
async fn my_audit_history(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    params: web::Query<PageParams>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let page = Page::from_params(&params);

    // An audit event is "about me" if it touches:
    //   - my patient row(s)
    //   - any of my medical records
    //   - an access permission I issued
    let rows = sqlx::query_as::<_, PatientAuditRow>(
        "SELECT \
            a.id, \
            a.action, \
            a.resource_type, \
            a.resource_id, \
            a.created_at, \
            a.blockchain_timestamp, \
            a.user_id AS actor_id, \
            u.first_name AS actor_first_name, \
            u.last_name AS actor_last_name, \
            u.role AS actor_role \
         FROM audit_logs a \
         LEFT JOIN users u ON u.id = a.user_id \
         WHERE a.resource_id IN ( \
             SELECT id FROM patients WHERE user_id = $1 \
             UNION \
             SELECT id FROM medical_records WHERE patient_id IN \
                 (SELECT id FROM patients WHERE user_id = $1) \
             UNION \
             SELECT id FROM access_permissions WHERE patient_id IN \
                 (SELECT id FROM patients WHERE user_id = $1) \
         ) \
         ORDER BY a.created_at DESC \
         LIMIT $2 OFFSET $3",
    )
    .bind(claims.sub)
    .bind(page.limit)
    .bind(page.offset)
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(rows))
}

pub fn audit_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list_audit_logs).service(my_audit_history);
}
