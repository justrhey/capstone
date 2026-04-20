use actix_web::{get, post, put, web, HttpRequest, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::config::Config;
use crate::services::audit_service::log_action;
use crate::services::auth_service::{require_claims, AppError};
use crate::services::encryption::{decrypt_field, encrypt_field};

#[derive(Debug, Serialize, FromRow)]
struct MessageRow {
    id: Uuid,
    sender_id: Uuid,
    recipient_id: Uuid,
    patient_id: Option<Uuid>,
    body: String, // enc:v1:…
    read_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct MessageView {
    id: Uuid,
    sender_id: Uuid,
    recipient_id: Uuid,
    patient_id: Option<Uuid>,
    body: String,
    read_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct ThreadSummary {
    counterparty_id: Uuid,
    counterparty_first_name: Option<String>,
    counterparty_last_name: Option<String>,
    counterparty_role: Option<String>,
    last_message_at: DateTime<Utc>,
    last_body: String,
    unread_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub to_user_id: Uuid,
    pub patient_id: Option<Uuid>,
    pub body: String,
}

fn decrypt_body(enc: &str, key: &str) -> String {
    decrypt_field(enc, key)
}

/// GET /api/messages — list thread summaries for the current user.
#[get("/api/messages")]
async fn list_threads(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;

    // Fetch the newest message per counterparty plus unread counts.
    // We pull everything involving the caller and aggregate in Rust — the
    // dataset stays small at capstone scale.
    let rows = sqlx::query_as::<_, MessageRow>(
        "SELECT * FROM messages WHERE sender_id = $1 OR recipient_id = $1 \
         ORDER BY created_at DESC LIMIT 2000",
    )
    .bind(claims.sub)
    .fetch_all(pool.get_ref())
    .await?;

    use std::collections::HashMap;
    let mut latest_per: HashMap<Uuid, &MessageRow> = HashMap::new();
    let mut unread: HashMap<Uuid, i64> = HashMap::new();
    for m in &rows {
        let cp = if m.sender_id == claims.sub {
            m.recipient_id
        } else {
            m.sender_id
        };
        latest_per.entry(cp).or_insert(m);
        if m.recipient_id == claims.sub && m.read_at.is_none() {
            *unread.entry(cp).or_insert(0) += 1;
        }
    }

    // Enrich with counterparty name/role.
    let mut summaries: Vec<ThreadSummary> = Vec::new();
    for (cp_id, msg) in latest_per {
        let info: Option<(Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT first_name, last_name, role FROM users WHERE id = $1",
        )
        .bind(cp_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);
        let (fname, lname, role) = info.unwrap_or((None, None, None));
        summaries.push(ThreadSummary {
            counterparty_id: cp_id,
            counterparty_first_name: fname,
            counterparty_last_name: lname,
            counterparty_role: role,
            last_message_at: msg.created_at,
            last_body: decrypt_body(&msg.body, &config.encryption_key),
            unread_count: *unread.get(&cp_id).unwrap_or(&0),
        });
    }
    summaries.sort_by(|a, b| b.last_message_at.cmp(&a.last_message_at));

    Ok(HttpResponse::Ok().json(summaries))
}

/// GET /api/messages/thread/{counterparty_id} — full conversation with one user.
#[get("/api/messages/thread/{id}")]
async fn get_thread(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let cp = path.into_inner();

    let rows = sqlx::query_as::<_, MessageRow>(
        "SELECT * FROM messages \
         WHERE (sender_id = $1 AND recipient_id = $2) \
            OR (sender_id = $2 AND recipient_id = $1) \
         ORDER BY created_at ASC LIMIT 500",
    )
    .bind(claims.sub)
    .bind(cp)
    .fetch_all(pool.get_ref())
    .await?;

    let views: Vec<MessageView> = rows
        .into_iter()
        .map(|m| MessageView {
            id: m.id,
            sender_id: m.sender_id,
            recipient_id: m.recipient_id,
            patient_id: m.patient_id,
            body: decrypt_body(&m.body, &config.encryption_key),
            read_at: m.read_at,
            created_at: m.created_at,
        })
        .collect();

    // Mark caller's inbound messages as read.
    let _ = sqlx::query(
        "UPDATE messages SET read_at = NOW() \
         WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL",
    )
    .bind(claims.sub)
    .bind(cp)
    .execute(pool.get_ref())
    .await;

    Ok(HttpResponse::Ok().json(views))
}

/// POST /api/messages — send a message.
#[post("/api/messages")]
async fn send_message(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<SendMessageRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let b = body.into_inner();
    if b.body.trim().is_empty() {
        return Err(AppError::BadRequest("body is required".into()));
    }
    if b.body.len() > 4000 {
        return Err(AppError::BadRequest("body too long (max 4000 chars)".into()));
    }
    if b.to_user_id == claims.sub {
        return Err(AppError::BadRequest("cannot message yourself".into()));
    }

    // Patient-side restriction: patients may only message staff.
    if claims.role == "patient" {
        let to_role: Option<String> =
            sqlx::query_scalar("SELECT role FROM users WHERE id = $1")
                .bind(b.to_user_id)
                .fetch_optional(pool.get_ref())
                .await?;
        match to_role.as_deref() {
            Some("doctor") | Some("nurse") | Some("admin") => {}
            _ => return Err(AppError::Forbidden("Patients may only message staff".into())),
        }
    }

    let enc = encrypt_field(b.body.trim(), &config.encryption_key)
        .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))?;

    let row: MessageRow = sqlx::query_as(
        "INSERT INTO messages (sender_id, recipient_id, patient_id, body) \
         VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(claims.sub)
    .bind(b.to_user_id)
    .bind(b.patient_id)
    .bind(&enc)
    .fetch_one(pool.get_ref())
    .await?;

    log_action(&pool, claims.sub, "message_sent", Some("message"), Some(row.id), &req).await;

    Ok(HttpResponse::Created().json(MessageView {
        id: row.id,
        sender_id: row.sender_id,
        recipient_id: row.recipient_id,
        patient_id: row.patient_id,
        body: b.body.trim().to_string(),
        read_at: row.read_at,
        created_at: row.created_at,
    }))
}

/// GET /api/messages/unread-count — badge for the header.
#[get("/api/messages/unread-count")]
async fn unread_count(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let n: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM messages WHERE recipient_id = $1 AND read_at IS NULL",
    )
    .bind(claims.sub)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);
    Ok(HttpResponse::Ok().json(serde_json::json!({ "count": n })))
}

/// PUT /api/messages/{id}/read — explicit mark-read (used when opening a thread out of order).
#[put("/api/messages/{id}/read")]
async fn mark_read(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let id = path.into_inner();
    let affected = sqlx::query(
        "UPDATE messages SET read_at = NOW() \
         WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL",
    )
    .bind(id)
    .bind(claims.sub)
    .execute(pool.get_ref())
    .await?
    .rows_affected();
    Ok(HttpResponse::Ok().json(serde_json::json!({ "marked": affected })))
}

pub fn message_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list_threads)
        .service(get_thread)
        .service(send_message)
        .service(unread_count)
        .service(mark_read);
}
