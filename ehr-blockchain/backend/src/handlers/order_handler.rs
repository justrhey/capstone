use actix_web::{get, post, put, web, HttpRequest, HttpResponse, Responder};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::medical_record::{MedicalRecord, Order};
use crate::services::audit_service::log_action;
use crate::services::auth_service::{require_claims, require_role, AppError};

#[derive(Debug, Deserialize)]
pub struct CreateOrderRequest {
    pub kind: String,                  // "lab" | "imaging" | "prescription"
    pub summary: String,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct ResolveOrderRequest {
    pub status: String,                // "fulfilled" | "cancelled"
    pub note: Option<String>,
}

async fn record_patient_user_id(pool: &PgPool, record_id: Uuid) -> Result<Option<Uuid>, AppError> {
    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT p.user_id FROM medical_records r \
         JOIN patients p ON p.id = r.patient_id WHERE r.id = $1",
    )
    .bind(record_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.and_then(|(u,)| Some(u)))
}

/// List orders for a specific record. Patients may only list their own.
#[get("/api/records/{id}/orders")]
async fn list_orders(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let record_id = path.into_inner();

    if claims.role == "patient" {
        match record_patient_user_id(pool.get_ref(), record_id).await? {
            Some(owner) if owner == claims.sub => {}
            _ => return Err(AppError::Forbidden("Not your record".into())),
        }
    }

    let rows = sqlx::query_as::<_, Order>(
        "SELECT * FROM orders WHERE record_id = $1 ORDER BY ordered_at DESC",
    )
    .bind(record_id)
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(rows))
}

/// Create a new order against an existing record. Doctor/nurse only.
#[post("/api/records/{id}/orders")]
async fn create_order(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<CreateOrderRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse"])?;
    let record_id = path.into_inner();
    let b = body.into_inner();

    if !matches!(b.kind.as_str(), "lab" | "imaging" | "prescription") {
        return Err(AppError::BadRequest(
            "kind must be one of: lab, imaging, prescription".into(),
        ));
    }
    if b.summary.trim().is_empty() {
        return Err(AppError::BadRequest("summary is required".into()));
    }

    // Verify record exists and capture its patient_id.
    let record: Option<MedicalRecord> =
        sqlx::query_as("SELECT * FROM medical_records WHERE id = $1")
            .bind(record_id)
            .fetch_optional(pool.get_ref())
            .await?;
    let record = record.ok_or_else(|| AppError::NotFound("Record not found".into()))?;

    let row = sqlx::query_as::<_, Order>(
        "INSERT INTO orders (record_id, patient_id, kind, summary, details, ordered_by) \
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    )
    .bind(record_id)
    .bind(record.patient_id)
    .bind(&b.kind)
    .bind(&b.summary)
    .bind(&b.details)
    .bind(claims.sub)
    .fetch_one(pool.get_ref())
    .await?;

    log_action(
        &pool,
        claims.sub,
        "order_created",
        Some("order"),
        Some(row.id),
        &req,
    )
    .await;

    Ok(HttpResponse::Created().json(row))
}

/// Mark an order fulfilled or cancelled. Staff only.
#[put("/api/orders/{id}/status")]
async fn resolve_order(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<ResolveOrderRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let id = path.into_inner();
    let b = body.into_inner();

    let (column, status) = match b.status.as_str() {
        "fulfilled" => ("fulfilled_at", "fulfilled"),
        "cancelled" => ("cancelled_at", "cancelled"),
        _ => return Err(AppError::BadRequest("status must be fulfilled or cancelled".into())),
    };

    // Two-step to avoid dynamic column injection: small match above, static SQL per branch.
    let updated = if column == "fulfilled_at" {
        sqlx::query(
            "UPDATE orders SET status = $1, fulfilled_at = NOW(), resolved_by = $2, resolution_note = $3 \
             WHERE id = $4 AND status = 'ordered'",
        )
    } else {
        sqlx::query(
            "UPDATE orders SET status = $1, cancelled_at = NOW(), resolved_by = $2, resolution_note = $3 \
             WHERE id = $4 AND status = 'ordered'",
        )
    }
    .bind(status)
    .bind(claims.sub)
    .bind(&b.note)
    .bind(id)
    .execute(pool.get_ref())
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("Open order not found".into()));
    }

    log_action(
        &pool,
        claims.sub,
        if status == "fulfilled" { "order_fulfilled" } else { "order_cancelled" },
        Some("order"),
        Some(id),
        &req,
    )
    .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "status": status })))
}

pub fn order_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list_orders).service(create_order).service(resolve_order);
}
