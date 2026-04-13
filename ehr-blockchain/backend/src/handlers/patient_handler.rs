use actix_web::{web, HttpResponse, Responder, get, post};
use crate::services::patient_service::{create_patient, create_patient_with_user, list_patients, get_patient_by_id};
use crate::models::patient::{CreatePatientRequest, CreatePatientWithAccountRequest};
use crate::services::auth_service::AppError;
use crate::config::Config;
use sqlx::PgPool;
use uuid::Uuid;

#[post("/api/patients")]
async fn create(
    pool: web::Data<PgPool>,
    body: web::Json<CreatePatientRequest>,
) -> Result<impl Responder, AppError> {
    let config = Config::from_env().map_err(|e| AppError::InternalError(e.to_string()))?;
    let patient = create_patient(&pool, body.into_inner(), &config).await?;
    Ok(HttpResponse::Created().json(patient))
}

#[post("/api/patients/with-account")]
async fn create_with_account(
    pool: web::Data<PgPool>,
    body: web::Json<CreatePatientWithAccountRequest>,
) -> Result<impl Responder, AppError> {
    let config = Config::from_env().map_err(|e| AppError::InternalError(e.to_string()))?;
    let result = create_patient_with_user(&pool, body.into_inner(), &config).await?;
    Ok(HttpResponse::Created().json(result))
}

#[get("/api/patients")]
async fn list(pool: web::Data<PgPool>) -> Result<impl Responder, AppError> {
    let patients = list_patients(&pool).await?;
    Ok(HttpResponse::Ok().json(patients))
}

#[get("/api/patients/{id}")]
async fn get(path: web::Path<Uuid>, pool: web::Data<PgPool>) -> Result<impl Responder, AppError> {
    let id = path.into_inner();
    let patient = get_patient_by_id(&pool, id).await?;
    Ok(HttpResponse::Ok().json(patient))
}

pub fn patient_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(create).service(create_with_account).service(list).service(get);
}