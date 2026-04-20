use actix_web::{delete, get, post, web, HttpRequest, HttpResponse, Responder};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::services::audit_service::log_action;
use crate::services::auth_service::{require_claims, require_role, AppError};

const MAX_BYTES: usize = 10 * 1024 * 1024; // 10 MB, matches DB CHECK

#[derive(Debug, Serialize, FromRow)]
pub struct AttachmentMeta {
    pub id: Uuid,
    pub order_id: Option<Uuid>,
    pub record_id: Option<Uuid>,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub content_sha256: String,
    pub uploaded_by: Option<Uuid>,
    pub uploaded_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UploadRequest {
    pub filename: String,
    pub mime_type: String,
    pub content_base64: String,
}

#[derive(Debug, FromRow)]
struct AttachmentRow {
    id: Uuid,
    order_id: Option<Uuid>,
    record_id: Option<Uuid>,
    filename: String,
    mime_type: String,
    size_bytes: i64,
    content_sha256: String,
    content: Vec<u8>,
    uploaded_by: Option<Uuid>,
    uploaded_at: DateTime<Utc>,
}

fn validate_mime(m: &str) -> bool {
    // Conservative allow-list for capstone.
    matches!(
        m,
        "application/pdf"
            | "image/png"
            | "image/jpeg"
            | "image/jpg"
            | "image/dicom"
            | "application/dicom"
            | "text/plain"
            | "text/csv"
            | "application/json"
    )
}

#[post("/api/orders/{id}/attachments")]
async fn upload_to_order(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<UploadRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let order_id = path.into_inner();
    let b = body.into_inner();

    if b.filename.trim().is_empty() {
        return Err(AppError::BadRequest("filename required".into()));
    }
    if !validate_mime(&b.mime_type) {
        return Err(AppError::BadRequest(format!(
            "mime_type {} not allowed",
            b.mime_type
        )));
    }

    let bytes = B64
        .decode(b.content_base64.as_bytes())
        .map_err(|_| AppError::BadRequest("content_base64 invalid".into()))?;
    if bytes.is_empty() {
        return Err(AppError::BadRequest("empty file".into()));
    }
    if bytes.len() > MAX_BYTES {
        return Err(AppError::BadRequest(format!(
            "file too large ({} bytes, max {})",
            bytes.len(),
            MAX_BYTES
        )));
    }

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest = hex::encode(hasher.finalize());

    // Confirm the order exists, gather its record_id for cross-linking.
    let record_id: Option<Uuid> =
        sqlx::query_scalar("SELECT record_id FROM orders WHERE id = $1")
            .bind(order_id)
            .fetch_optional(pool.get_ref())
            .await?
            .ok_or_else(|| AppError::NotFound("Order not found".into()))?;

    let row = sqlx::query_as::<_, AttachmentMeta>(
        "INSERT INTO attachments \
            (order_id, record_id, filename, mime_type, size_bytes, content_sha256, content, uploaded_by) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
         RETURNING id, order_id, record_id, filename, mime_type, size_bytes, content_sha256, uploaded_by, uploaded_at",
    )
    .bind(order_id)
    .bind(record_id)
    .bind(&b.filename)
    .bind(&b.mime_type)
    .bind(bytes.len() as i64)
    .bind(&digest)
    .bind(&bytes)
    .bind(claims.sub)
    .fetch_one(pool.get_ref())
    .await?;

    log_action(&pool, claims.sub, "attachment_uploaded", Some("attachment"), Some(row.id), &req).await;
    Ok(HttpResponse::Created().json(row))
}

#[get("/api/orders/{id}/attachments")]
async fn list_for_order(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    require_claims(&req)?;
    let order_id = path.into_inner();
    let rows = sqlx::query_as::<_, AttachmentMeta>(
        "SELECT id, order_id, record_id, filename, mime_type, size_bytes, content_sha256, uploaded_by, uploaded_at \
         FROM attachments WHERE order_id = $1 ORDER BY uploaded_at DESC",
    )
    .bind(order_id)
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(rows))
}

#[get("/api/attachments/{id}/download")]
async fn download_attachment(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let id = path.into_inner();
    let row: Option<AttachmentRow> =
        sqlx::query_as("SELECT * FROM attachments WHERE id = $1")
            .bind(id)
            .fetch_optional(pool.get_ref())
            .await?;
    let row = row.ok_or_else(|| AppError::NotFound("Attachment not found".into()))?;

    // Patients may only download attachments tied to their own records.
    if claims.role == "patient" {
        let target_record = row.record_id;
        if let Some(rid) = target_record {
            let owner: Option<Uuid> = sqlx::query_scalar(
                "SELECT p.user_id FROM medical_records r \
                 JOIN patients p ON p.id = r.patient_id WHERE r.id = $1",
            )
            .bind(rid)
            .fetch_optional(pool.get_ref())
            .await?;
            if owner != Some(claims.sub) {
                return Err(AppError::Forbidden("Not your record".into()));
            }
        } else {
            return Err(AppError::Forbidden("Not your record".into()));
        }
    }

    log_action(&pool, claims.sub, "attachment_downloaded", Some("attachment"), Some(row.id), &req).await;

    // Suppress unused warnings on the non-binary fields — included for logs.
    let _ = (row.order_id, row.record_id, row.size_bytes, row.content_sha256, row.uploaded_by, row.uploaded_at);

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", row.mime_type))
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", row.filename.replace('"', "'")),
        ))
        .body(row.content))
}

#[delete("/api/attachments/{id}")]
async fn delete_attachment(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let id = path.into_inner();
    let affected = sqlx::query("DELETE FROM attachments WHERE id = $1")
        .bind(id)
        .execute(pool.get_ref())
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound("Attachment not found".into()));
    }
    log_action(&pool, claims.sub, "attachment_deleted", Some("attachment"), Some(id), &req).await;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "deleted": true })))
}

pub fn attachment_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(upload_to_order)
        .service(list_for_order)
        .service(download_attachment)
        .service(delete_attachment);
}
