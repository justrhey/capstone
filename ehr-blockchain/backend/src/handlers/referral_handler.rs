use actix_web::{get, post, put, web, HttpRequest, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::services::audit_service::log_action;
use crate::services::auth_service::{require_claims, require_role, AppError};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Referral {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub from_user_id: Uuid,
    pub to_user_id: Uuid,
    pub specialty: Option<String>,
    pub reason: String,
    pub status: String,
    pub response_note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ReferralWithNames {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub from_user_id: Uuid,
    pub to_user_id: Uuid,
    pub specialty: Option<String>,
    pub reason: String,
    pub status: String,
    pub response_note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub patient_first_name: Option<String>,
    pub patient_last_name: Option<String>,
    pub from_first_name: Option<String>,
    pub from_last_name: Option<String>,
    pub to_first_name: Option<String>,
    pub to_last_name: Option<String>,
    pub to_role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReferralRequest {
    pub patient_id: Uuid,
    pub to_user_id: Uuid,
    pub specialty: Option<String>,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStatusRequest {
    pub status: String,
    pub note: Option<String>,
}

#[get("/api/referrals")]
async fn list_referrals(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;

    // Staff sees referrals they sent OR received; admin sees all; patient sees
    // their own patient_id.
    let sql = match claims.role.as_str() {
        "admin" | "auditor" => {
            "SELECT r.*, \
                 pf.first_name AS patient_first_name, pf.last_name AS patient_last_name, \
                 uf.first_name AS from_first_name, uf.last_name AS from_last_name, \
                 ut.first_name AS to_first_name, ut.last_name AS to_last_name, ut.role AS to_role \
             FROM referrals r \
             LEFT JOIN patients pf ON pf.id = r.patient_id \
             LEFT JOIN users uf ON uf.id = r.from_user_id \
             LEFT JOIN users ut ON ut.id = r.to_user_id \
             ORDER BY r.created_at DESC LIMIT 500"
        }
        "patient" => {
            "SELECT r.*, \
                 pf.first_name AS patient_first_name, pf.last_name AS patient_last_name, \
                 uf.first_name AS from_first_name, uf.last_name AS from_last_name, \
                 ut.first_name AS to_first_name, ut.last_name AS to_last_name, ut.role AS to_role \
             FROM referrals r \
             JOIN patients p ON p.id = r.patient_id \
             LEFT JOIN patients pf ON pf.id = r.patient_id \
             LEFT JOIN users uf ON uf.id = r.from_user_id \
             LEFT JOIN users ut ON ut.id = r.to_user_id \
             WHERE p.user_id = $1 ORDER BY r.created_at DESC"
        }
        _ => {
            "SELECT r.*, \
                 pf.first_name AS patient_first_name, pf.last_name AS patient_last_name, \
                 uf.first_name AS from_first_name, uf.last_name AS from_last_name, \
                 ut.first_name AS to_first_name, ut.last_name AS to_last_name, ut.role AS to_role \
             FROM referrals r \
             LEFT JOIN patients pf ON pf.id = r.patient_id \
             LEFT JOIN users uf ON uf.id = r.from_user_id \
             LEFT JOIN users ut ON ut.id = r.to_user_id \
             WHERE r.from_user_id = $1 OR r.to_user_id = $1 \
             ORDER BY r.created_at DESC LIMIT 500"
        }
    };

    let rows = if matches!(claims.role.as_str(), "admin" | "auditor") {
        sqlx::query_as::<_, ReferralWithNames>(sql)
            .fetch_all(pool.get_ref())
            .await?
    } else {
        sqlx::query_as::<_, ReferralWithNames>(sql)
            .bind(claims.sub)
            .fetch_all(pool.get_ref())
            .await?
    };

    Ok(HttpResponse::Ok().json(rows))
}

#[post("/api/referrals")]
async fn create_referral(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateReferralRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let b = body.into_inner();
    if b.reason.trim().is_empty() {
        return Err(AppError::BadRequest("reason is required".into()));
    }
    if b.to_user_id == claims.sub {
        return Err(AppError::BadRequest("cannot refer to yourself".into()));
    }
    // Verify recipient is staff.
    let to_role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = $1")
        .bind(b.to_user_id)
        .fetch_optional(pool.get_ref())
        .await?;
    match to_role.as_deref() {
        Some("doctor") | Some("nurse") | Some("admin") => {}
        _ => return Err(AppError::BadRequest("recipient must be staff".into())),
    }

    let row = sqlx::query_as::<_, Referral>(
        "INSERT INTO referrals (patient_id, from_user_id, to_user_id, specialty, reason) \
         VALUES ($1, $2, $3, $4, $5) RETURNING *",
    )
    .bind(b.patient_id)
    .bind(claims.sub)
    .bind(b.to_user_id)
    .bind(b.specialty)
    .bind(b.reason.trim())
    .fetch_one(pool.get_ref())
    .await?;

    log_action(&pool, claims.sub, "referral_created", Some("referral"), Some(row.id), &req).await;
    Ok(HttpResponse::Created().json(row))
}

#[put("/api/referrals/{id}/status")]
async fn update_referral_status(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<UpdateStatusRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let id = path.into_inner();
    let b = body.into_inner();
    if !matches!(b.status.as_str(), "accepted" | "declined" | "completed" | "cancelled") {
        return Err(AppError::BadRequest(
            "status must be accepted|declined|completed|cancelled".into(),
        ));
    }

    // Authorization: recipient can accept/decline/complete; sender can cancel; admin can do any.
    let referral: Option<Referral> = sqlx::query_as("SELECT * FROM referrals WHERE id = $1")
        .bind(id)
        .fetch_optional(pool.get_ref())
        .await?;
    let r = referral.ok_or_else(|| AppError::NotFound("Referral not found".into()))?;

    let is_admin = claims.role == "admin";
    let is_recipient = r.to_user_id == claims.sub;
    let is_sender = r.from_user_id == claims.sub;

    let allowed = match b.status.as_str() {
        "cancelled" => is_admin || is_sender,
        "accepted" | "declined" | "completed" => is_admin || is_recipient,
        _ => false,
    };
    if !allowed {
        return Err(AppError::Forbidden("Not authorized to set this status".into()));
    }

    let updated = sqlx::query_as::<_, Referral>(
        "UPDATE referrals SET status = $1, response_note = $2, updated_at = NOW() \
         WHERE id = $3 RETURNING *",
    )
    .bind(&b.status)
    .bind(&b.note)
    .bind(id)
    .fetch_one(pool.get_ref())
    .await?;

    log_action(&pool, claims.sub, &format!("referral_{}", b.status), Some("referral"), Some(id), &req).await;
    Ok(HttpResponse::Ok().json(updated))
}

pub fn referral_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list_referrals)
        .service(create_referral)
        .service(update_referral_status);
}
