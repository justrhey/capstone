use actix_web::{web, HttpResponse, Responder, get, post, put, delete, HttpMessage, HttpRequest};
use uuid::Uuid;
use crate::services::record_service::{create_record, get_records_by_patient, list_all_records, get_record_by_id, update_record, delete_record};
use crate::models::medical_record::{CreateRecordRequest, UpdateRecordRequest};
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

#[get("/api/records")]
async fn list_all(pool: web::Data<PgPool>) -> Result<impl Responder, AppError> {
    let records = list_all_records(&pool).await?;
    Ok(HttpResponse::Ok().json(records))
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

#[get("/api/records/{id}")]
async fn get(
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let id = path.into_inner();
    // Get the record and its medications/allergies
    let record = get_record_by_id(&pool, id).await?;
    
    let medications = sqlx::query_as::<_, crate::models::medical_record::Medication>(
        "SELECT * FROM medications WHERE record_id = $1"
    )
        .bind(id)
        .fetch_all(pool.get_ref())
        .await?;

    let allergies = sqlx::query_as::<_, crate::models::medical_record::Allergy>(
        "SELECT * FROM allergies WHERE record_id = $1"
    )
        .bind(id)
        .fetch_all(pool.get_ref())
        .await?;

    let blockchain_verified = record.blockchain_tx_id.is_some();
    let blockchain_tx_hash = record.blockchain_tx_id.clone();

    Ok(HttpResponse::Ok().json(crate::models::medical_record::RecordResponse {
        record,
        medications,
        allergies,
        blockchain_verified,
        blockchain_tx_hash,
    }))
}

#[put("/api/records/{id}")]
async fn update(
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<UpdateRecordRequest>,
) -> Result<impl Responder, AppError> {
    let id = path.into_inner();
    let result = update_record(&pool, id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(result))
}

#[delete("/api/records/{id}")]
async fn delete(
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let id = path.into_inner();
    delete_record(&pool, id).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "Medical record deleted" })))
}

pub fn record_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(create).service(list_all).service(list_by_patient).service(get).service(update).service(delete);
}
