use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::services::audit_service::log_action;
use crate::services::auth_service::{require_claims, require_role, AppError};

#[derive(Debug, Deserialize)]
pub struct RequestErasureBody {
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ErasureRequest {
    pub id: Uuid,
    pub user_id: Uuid,
    pub reason: Option<String>,
    pub status: String,
    pub requested_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<Uuid>,
    pub admin_note: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ErasureRequestWithUser {
    pub id: Uuid,
    pub user_id: Uuid,
    pub reason: Option<String>,
    pub status: String,
    pub requested_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<Uuid>,
    pub admin_note: Option<String>,
    pub requester_email: Option<String>,
    pub requester_first_name: Option<String>,
    pub requester_last_name: Option<String>,
}

/// Patient-initiated erasure request.
#[post("/api/me/erasure-request")]
async fn request_erasure(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<RequestErasureBody>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;

    // Refuse if the caller already has an open request.
    let open: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM erasure_requests WHERE user_id = $1 AND status = 'pending'",
    )
    .bind(claims.sub)
    .fetch_one(pool.get_ref())
    .await?;
    if open > 0 {
        return Err(AppError::Conflict(
            "You already have a pending erasure request.".into(),
        ));
    }

    let row = sqlx::query_as::<_, ErasureRequest>(
        "INSERT INTO erasure_requests (user_id, reason) VALUES ($1, $2) RETURNING *",
    )
    .bind(claims.sub)
    .bind(&body.reason)
    .fetch_one(pool.get_ref())
    .await?;

    log_action(
        &pool,
        claims.sub,
        "erasure_requested",
        Some("erasure_request"),
        Some(row.id),
        &req,
    )
    .await;

    Ok(HttpResponse::Created().json(row))
}

/// Admin queue — pending requests first, then the rest.
#[get("/api/erasure-requests")]
async fn list_erasure_requests(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["admin"])?;
    let rows = sqlx::query_as::<_, ErasureRequestWithUser>(
        "SELECT e.id, e.user_id, e.reason, e.status, e.requested_at, e.resolved_at, \
                e.resolved_by, e.admin_note, \
                u.email AS requester_email, \
                u.first_name AS requester_first_name, \
                u.last_name AS requester_last_name \
         FROM erasure_requests e \
         LEFT JOIN users u ON u.id = e.user_id \
         ORDER BY (e.status = 'pending') DESC, e.requested_at DESC \
         LIMIT 500",
    )
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(rows))
}

#[derive(Debug, Deserialize)]
pub struct ResolveBody {
    pub action: String, // "approve" | "decline"
    pub note: Option<String>,
}

/// Admin decision on a pending erasure request.
/// Approve: soft-deletes the user and their patient row(s). Existing records
/// are NOT hard-deleted; their rows remain on-chain. Hard deletion would
/// require a coordinated on-chain purge (future work).
#[post("/api/erasure-requests/{id}/resolve")]
async fn resolve_erasure_request(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<ResolveBody>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;
    let id = path.into_inner();

    let action = body.action.to_lowercase();
    let new_status = match action.as_str() {
        "approve" => "approved",
        "decline" => "declined",
        _ => return Err(AppError::BadRequest("action must be 'approve' or 'decline'".into())),
    };

    // Load the request; must be pending.
    let request: ErasureRequest = sqlx::query_as::<_, ErasureRequest>(
        "SELECT * FROM erasure_requests WHERE id = $1 AND status = 'pending'",
    )
    .bind(id)
    .fetch_optional(pool.get_ref())
    .await?
    .ok_or_else(|| AppError::NotFound("Pending erasure request not found".into()))?;

    let mut tx = pool.begin().await?;

    sqlx::query(
        "UPDATE erasure_requests SET status = $1, resolved_at = NOW(), \
         resolved_by = $2, admin_note = $3 WHERE id = $4",
    )
    .bind(new_status)
    .bind(claims.sub)
    .bind(&body.note)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if action == "approve" {
        sqlx::query("UPDATE patients SET deleted_at = NOW() WHERE user_id = $1")
            .bind(request.user_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE users SET deleted_at = NOW() WHERE id = $1")
            .bind(request.user_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    log_action(
        &pool,
        claims.sub,
        if action == "approve" {
            "erasure_approved"
        } else {
            "erasure_declined"
        },
        Some("erasure_request"),
        Some(id),
        &req,
    )
    .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "id": id,
        "status": new_status,
    })))
}

pub fn erasure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(request_erasure)
        .service(list_erasure_requests)
        .service(resolve_erasure_request);
}
