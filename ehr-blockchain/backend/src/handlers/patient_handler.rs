use actix_web::{web, HttpResponse, Responder, get, post, put, delete, HttpRequest};
use crate::services::patient_service::{create_patient, create_patient_with_user, list_patients, list_assigned_patients, session_is_break_glass, get_patient_by_id, update_patient, delete_patient};
use crate::models::patient::{CreatePatientRequest, CreatePatientWithAccountRequest, UpdatePatientRequest};
use crate::services::auth_service::{require_claims, require_role, AppError};
use crate::services::audit_service::log_action;
use crate::services::pagination::{Page, PageParams};
use crate::config::Config;
use sqlx::PgPool;
use uuid::Uuid;

#[post("/api/patients")]
async fn create(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<CreatePatientRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "admin"])?;
    let patient = create_patient(&pool, body.into_inner(), config.get_ref()).await?;
    log_action(&pool, claims.sub, "patient_created", Some("patient"), Some(patient.id), &req).await;
    Ok(HttpResponse::Created().json(patient))
}

#[post("/api/patients/with-account")]
async fn create_with_account(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<CreatePatientWithAccountRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;
    let result = create_patient_with_user(&pool, body.into_inner(), config.get_ref()).await?;
    log_action(&pool, claims.sub, "patient_account_created", Some("patient"), Some(result.patient_id), &req).await;
    Ok(HttpResponse::Created().json(result))
}

#[get("/api/patients")]
async fn list(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    params: web::Query<PageParams>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let page = Page::from_params(&params);

    // SEC-4: admins always see everything; doctors/nurses see only assigned
    // patients unless they're in an active break-glass window.
    let patients = if claims.role == "admin" || session_is_break_glass(&pool, claims.jti).await {
        list_patients(&pool, page).await?
    } else {
        list_assigned_patients(&pool, claims.sub, page).await?
    };

    Ok(HttpResponse::Ok().json(patients))
}

/// Patient self-lookup: returns the caller's own patient profile (if any).
/// Spec section 7 keeps /api/patients staff-only; this is the patient-side path.
#[get("/api/patients/me")]
async fn me(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let patients = sqlx::query_as::<_, crate::models::patient::Patient>(
        "SELECT * FROM patients WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(claims.sub)
    .fetch_all(pool.get_ref())
    .await?;

    // Decrypt names in place before returning.
    let config = crate::config::Config::from_env()
        .map_err(|e| AppError::InternalError(format!("Config error: {}", e)))?;
    let mut patients = patients;
    for p in &mut patients {
        p.first_name = crate::services::encryption::decrypt_field_opt(&p.first_name, &config.encryption_key);
        p.last_name = crate::services::encryption::decrypt_field_opt(&p.last_name, &config.encryption_key);
    }

    Ok(HttpResponse::Ok().json(patients))
}

#[get("/api/patients/{id}")]
async fn get(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let id = path.into_inner();
    let patient = get_patient_by_id(&pool, id).await?;

    if claims.role == "patient" && patient.user_id != Some(claims.sub) {
        return Err(AppError::Forbidden("Not your record".into()));
    }

    Ok(HttpResponse::Ok().json(patient))
}

#[put("/api/patients/{id}")]
async fn update(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<UpdatePatientRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let id = path.into_inner();
    let patient = update_patient(&pool, id, body.into_inner(), config.get_ref()).await?;
    log_action(&pool, claims.sub, "patient_updated", Some("patient"), Some(id), &req).await;
    Ok(HttpResponse::Ok().json(patient))
}

#[delete("/api/patients/{id}")]
async fn delete(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;
    let id = path.into_inner();
    delete_patient(&pool, id).await?;
    log_action(&pool, claims.sub, "patient_deleted", Some("patient"), Some(id), &req).await;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "Patient deleted" })))
}

pub fn patient_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(create)
        .service(create_with_account)
        .service(me)
        .service(list)
        .service(get)
        .service(update)
        .service(delete);
}
