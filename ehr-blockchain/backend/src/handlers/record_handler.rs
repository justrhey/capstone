use actix_web::{web, HttpResponse, Responder, get, post, HttpMessage, HttpRequest};
use uuid::Uuid;
use crate::services::record_service::{create_record, get_records_by_patient};
use crate::models::medical_record::CreateRecordRequest;
use crate::models::User;
use crate::services::auth_service::AppError;
use sqlx::PgPool;

#[post("/api/records")]
async fn create(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateRecordRequest>,
) -> Result<impl Responder, AppError> {
    let created_by = req.extensions()
        .get::<User>()
        .map(|c| c.id)
        .unwrap_or_else(Uuid::nil);
    let result = create_record(&pool, body.into_inner(), created_by).await?;
    Ok(HttpResponse::Created().json(result))
}

#[get("/api/patients/{id}/records")]
async fn list_by_patient(
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let patient_id = path.into_inner();
    let records = get_records_by_patient(&pool, patient_id).await?;
    Ok(HttpResponse::Ok().json(records))
}

pub fn record_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(create).service(list_by_patient);
}
