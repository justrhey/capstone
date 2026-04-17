use actix_web::{get, post, put, web, HttpRequest, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::services::audit_service::log_action;
use crate::services::auth_service::{require_claims, require_role, AppError};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Appointment {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub staff_user_id: Uuid,
    pub start_at: DateTime<Utc>,
    pub duration_minutes: i32,
    pub reason: Option<String>,
    pub status: String,
    pub booked_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<Uuid>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct AppointmentWithNames {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub staff_user_id: Uuid,
    pub start_at: DateTime<Utc>,
    pub duration_minutes: i32,
    pub reason: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    pub patient_first_name: Option<String>,
    pub patient_last_name: Option<String>,
    pub staff_first_name: Option<String>,
    pub staff_last_name: Option<String>,
    pub staff_role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BookRequest {
    pub patient_id: Option<Uuid>, // optional for patient role (auto-filled)
    pub staff_user_id: Uuid,
    pub start_at: DateTime<Utc>,
    pub duration_minutes: Option<i32>,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StatusUpdateRequest {
    pub status: String, // completed | cancelled | no_show
    pub notes: Option<String>,
}

fn select_with_names() -> &'static str {
    "SELECT a.id, a.patient_id, a.staff_user_id, a.start_at, a.duration_minutes, \
            a.reason, a.status, a.created_at, a.resolved_at, a.notes, \
            p.first_name AS patient_first_name, p.last_name AS patient_last_name, \
            u.first_name AS staff_first_name, u.last_name AS staff_last_name, u.role AS staff_role \
     FROM appointments a \
     LEFT JOIN patients p ON p.id = a.patient_id \
     LEFT JOIN users u    ON u.id = a.staff_user_id"
}

/// List appointments the caller can see.
/// - Patient: only their own.
/// - Doctor/nurse: only ones they're the staff on.
/// - Admin/auditor: everything.
#[get("/api/appointments")]
async fn list_appointments(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let base = select_with_names();

    let rows = match claims.role.as_str() {
        "patient" => {
            let sql = format!(
                "{base} WHERE p.user_id = $1 ORDER BY a.start_at DESC LIMIT 500",
                base = base
            );
            sqlx::query_as::<_, AppointmentWithNames>(&sql)
                .bind(claims.sub)
                .fetch_all(pool.get_ref())
                .await?
        }
        "doctor" | "nurse" => {
            let sql = format!(
                "{base} WHERE a.staff_user_id = $1 ORDER BY a.start_at DESC LIMIT 500",
                base = base
            );
            sqlx::query_as::<_, AppointmentWithNames>(&sql)
                .bind(claims.sub)
                .fetch_all(pool.get_ref())
                .await?
        }
        _ => {
            let sql = format!("{base} ORDER BY a.start_at DESC LIMIT 500", base = base);
            sqlx::query_as::<_, AppointmentWithNames>(&sql)
                .fetch_all(pool.get_ref())
                .await?
        }
    };

    Ok(HttpResponse::Ok().json(rows))
}

/// Book a new appointment.
/// - Patient books against a doctor/nurse for themselves (patient_id inferred).
/// - Admin may book on behalf of any patient for any staff.
#[post("/api/appointments")]
async fn book_appointment(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<BookRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let b = body.into_inner();

    let patient_id = match (claims.role.as_str(), b.patient_id) {
        ("patient", _) => {
            // Infer from the caller's linked patient row.
            let id: Option<Uuid> = sqlx::query_scalar(
                "SELECT id FROM patients WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1",
            )
            .bind(claims.sub)
            .fetch_optional(pool.get_ref())
            .await?;
            id.ok_or_else(|| AppError::BadRequest("No patient profile linked to your account".into()))?
        }
        ("admin", Some(id)) => id,
        ("admin", None) => return Err(AppError::BadRequest("patient_id required for admin booking".into())),
        _ => return Err(AppError::Forbidden("Only patients or admins can book".into())),
    };

    // Verify staff_user_id is a doctor or nurse.
    let staff_ok: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND role IN ('doctor','nurse') AND deleted_at IS NULL)",
    )
    .bind(b.staff_user_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(false);
    if !staff_ok {
        return Err(AppError::BadRequest("staff_user_id must reference an active doctor or nurse".into()));
    }

    let duration = b.duration_minutes.unwrap_or(30);
    if !(1..=480).contains(&duration) {
        return Err(AppError::BadRequest("duration_minutes must be 1–480".into()));
    }

    let row = sqlx::query_as::<_, Appointment>(
        "INSERT INTO appointments (patient_id, staff_user_id, start_at, duration_minutes, reason, booked_by) \
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    )
    .bind(patient_id)
    .bind(b.staff_user_id)
    .bind(b.start_at)
    .bind(duration)
    .bind(&b.reason)
    .bind(claims.sub)
    .fetch_one(pool.get_ref())
    .await?;

    log_action(&pool, claims.sub, "appointment_booked", Some("appointment"), Some(row.id), &req).await;
    Ok(HttpResponse::Created().json(row))
}

/// Staff-only status transitions: completed / cancelled / no_show.
/// Cancelling is also allowed for the patient who booked.
#[put("/api/appointments/{id}/status")]
async fn update_status(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<StatusUpdateRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let id = path.into_inner();
    let b = body.into_inner();

    let allowed = matches!(b.status.as_str(), "completed" | "cancelled" | "no_show");
    if !allowed {
        return Err(AppError::BadRequest("status must be completed|cancelled|no_show".into()));
    }

    // Load the row to decide authorization.
    let appt: Option<Appointment> = sqlx::query_as("SELECT * FROM appointments WHERE id = $1")
        .bind(id)
        .fetch_optional(pool.get_ref())
        .await?;
    let appt = appt.ok_or_else(|| AppError::NotFound("Appointment not found".into()))?;

    let authorized = match claims.role.as_str() {
        "admin" => true,
        "doctor" | "nurse" => appt.staff_user_id == claims.sub,
        "patient" => {
            // Patients may only cancel their own (not complete/no_show).
            b.status == "cancelled" && {
                let owner: Option<Uuid> = sqlx::query_scalar(
                    "SELECT user_id FROM patients WHERE id = $1",
                )
                .bind(appt.patient_id)
                .fetch_optional(pool.get_ref())
                .await?;
                owner == Some(claims.sub)
            }
        }
        _ => false,
    };
    if !authorized {
        return Err(AppError::Forbidden("Not allowed to change this appointment".into()));
    }

    sqlx::query(
        "UPDATE appointments SET status = $1, notes = COALESCE($2, notes), \
         resolved_at = NOW(), resolved_by = $3 WHERE id = $4 AND status = 'scheduled'",
    )
    .bind(&b.status)
    .bind(&b.notes)
    .bind(claims.sub)
    .bind(id)
    .execute(pool.get_ref())
    .await?;

    log_action(
        &pool,
        claims.sub,
        match b.status.as_str() {
            "completed" => "appointment_completed",
            "cancelled" => "appointment_cancelled",
            _ => "appointment_no_show",
        },
        Some("appointment"),
        Some(id),
        &req,
    )
    .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "status": b.status })))
}

pub fn appointment_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list_appointments)
        .service(book_appointment)
        .service(update_status);
}
