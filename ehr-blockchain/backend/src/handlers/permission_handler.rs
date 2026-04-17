use actix_web::{web, HttpResponse, Responder, get, post, delete, HttpRequest};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::services::auth_service::{require_claims, require_role, AppError};
use crate::services::audit_service::log_action;
use crate::services::blockchain_service::grant_access_onchain;
use crate::config::Config;

#[derive(Debug, Serialize, FromRow)]
pub struct AccessPermission {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub granted_to: Uuid,
    pub record_id: Option<Uuid>,
    pub permission_type: String,
    pub granted_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct GrantPermissionRequest {
    pub patient_id: Uuid,
    pub granted_to: Uuid,
    pub record_id: Option<Uuid>,
    pub permission_type: String,
    pub expires_at: Option<DateTime<Utc>>,
}

#[post("/api/permissions")]
async fn grant(
    http_req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<GrantPermissionRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&http_req, &["patient", "admin"])?;
    let req = body.into_inner();

    if !["read", "write"].contains(&req.permission_type.as_str()) {
        return Err(AppError::BadRequest(
            "permission_type must be 'read' or 'write'".into(),
        ));
    }

    if claims.role == "patient" {
        let owner: Option<Uuid> = sqlx::query_scalar(
            "SELECT user_id FROM patients WHERE id = $1",
        )
        .bind(req.patient_id)
        .fetch_optional(pool.get_ref())
        .await?;
        if owner != Some(claims.sub) {
            return Err(AppError::Forbidden("Not your patient record".into()));
        }
    }

    let permission = sqlx::query_as::<_, AccessPermission>(
        "INSERT INTO access_permissions \
            (patient_id, granted_to, record_id, permission_type, expires_at, status) \
         VALUES ($1, $2, $3, $4, $5, 'active') \
         RETURNING *",
    )
    .bind(req.patient_id)
    .bind(req.granted_to)
    .bind(req.record_id)
    .bind(&req.permission_type)
    .bind(req.expires_at)
    .fetch_one(pool.get_ref())
    .await?;

    // Best-effort on-chain mirror. Silent if chain unreachable.
    if let Ok(config) = Config::from_env() {
        let duration_seconds: u64 = permission.expires_at
            .map(|exp| (exp - permission.granted_at).num_seconds().max(0) as u64)
            .unwrap_or(0);
        let record_id_str = permission.record_id
            .map(|r| r.to_string())
            .unwrap_or_default();
        let _ = grant_access_onchain(
            &pool,
            &permission.patient_id.to_string(),
            &permission.granted_to.to_string(),
            &record_id_str,
            duration_seconds,
            &config,
        ).await;
    }

    log_action(&pool, claims.sub, "permission_granted", Some("access_permission"), Some(permission.id), &http_req).await;

    Ok(HttpResponse::Created().json(permission))
}

#[delete("/api/permissions/{id}")]
async fn revoke(
    http_req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&http_req, &["patient", "admin"])?;
    let id = path.into_inner();

    if claims.role == "patient" {
        let owner: Option<Uuid> = sqlx::query_scalar(
            "SELECT p.user_id FROM access_permissions ap \
             JOIN patients p ON p.id = ap.patient_id WHERE ap.id = $1",
        )
        .bind(id)
        .fetch_optional(pool.get_ref())
        .await?;
        if owner != Some(claims.sub) {
            return Err(AppError::Forbidden("Not your permission".into()));
        }
    }

    let result = sqlx::query(
        "UPDATE access_permissions SET status = 'revoked' WHERE id = $1 AND status = 'active'",
    )
    .bind(id)
    .execute(pool.get_ref())
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "Active permission not found".into(),
        ));
    }

    log_action(&pool, claims.sub, "permission_revoked", Some("access_permission"), Some(id), &http_req).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "Permission revoked" })))
}

#[get("/api/permissions")]
async fn list(http_req: HttpRequest, pool: web::Data<PgPool>) -> Result<impl Responder, AppError> {
    let claims = require_claims(&http_req)?;

    let permissions = if claims.role == "patient" {
        sqlx::query_as::<_, AccessPermission>(
            "SELECT ap.* FROM access_permissions ap \
             JOIN patients p ON p.id = ap.patient_id \
             WHERE p.user_id = $1 ORDER BY granted_at DESC",
        )
        .bind(claims.sub)
        .fetch_all(pool.get_ref())
        .await?
    } else {
        sqlx::query_as::<_, AccessPermission>(
            "SELECT * FROM access_permissions ORDER BY granted_at DESC",
        )
        .fetch_all(pool.get_ref())
        .await?
    };

    Ok(HttpResponse::Ok().json(permissions))
}

#[get("/api/patients/{id}/permissions")]
async fn list_for_patient(
    http_req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&http_req)?;
    let patient_id = path.into_inner();

    if claims.role == "patient" {
        let owner: Option<Uuid> = sqlx::query_scalar(
            "SELECT user_id FROM patients WHERE id = $1",
        )
        .bind(patient_id)
        .fetch_optional(pool.get_ref())
        .await?;
        if owner != Some(claims.sub) {
            return Err(AppError::Forbidden("Not your patient".into()));
        }
    }

    let permissions = sqlx::query_as::<_, AccessPermission>(
        "SELECT * FROM access_permissions WHERE patient_id = $1 ORDER BY granted_at DESC",
    )
    .bind(patient_id)
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(permissions))
}

pub fn permission_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(grant)
        .service(revoke)
        .service(list)
        .service(list_for_patient);
}
