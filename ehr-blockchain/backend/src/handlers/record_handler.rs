use actix_web::{web, HttpResponse, Responder, get, post, put, delete, HttpRequest};
use uuid::Uuid;
use crate::services::record_service::{create_record, get_records_by_patient, list_all_records, get_record_by_id, update_record, delete_record, build_receipt};
use crate::models::medical_record::{CreateRecordRequest, UpdateRecordRequest};
use crate::services::auth_service::{require_claims, require_role, AppError};
use crate::services::audit_service::log_action;
use crate::services::pagination::{Page, PageParams};
use sqlx::PgPool;

#[post("/api/records")]
async fn create(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateRecordRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse"])?;
    let result = create_record(&pool, body.into_inner(), claims.sub).await?;
    log_action(&pool, claims.sub, "record_created", Some("medical_record"), Some(result.record.id), &req).await;
    Ok(HttpResponse::Created().json(result))
}

#[get("/api/records")]
async fn list_all(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    params: web::Query<PageParams>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["doctor", "nurse", "admin"])?;
    let records = list_all_records(&pool, Page::from_params(&params)).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[get("/api/patients/{id}/records")]
async fn list_by_patient(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    config: web::Data<crate::config::Config>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let patient_id = path.into_inner();

    // Patients may only access their own records.
    if claims.role == "patient" {
        let owner_id: Option<Uuid> = sqlx::query_scalar(
            "SELECT user_id FROM patients WHERE id = $1",
        )
        .bind(patient_id)
        .fetch_optional(pool.get_ref())
        .await?;
        if owner_id != Some(claims.sub) {
            return Err(AppError::Forbidden("Not your record".into()));
        }
    }

    // Doctors and nurses must also carry an on-chain access grant. The chain
    // is authoritative; DB is only consulted if the chain is unreachable.
    // SEC-3 break-glass: if the caller's current session is inside a
    // break-glass window, skip the grant check entirely and log elevated.
    if matches!(claims.role.as_str(), "doctor" | "nurse") {
        let break_glass_active: bool = if let Some(jti) = claims.jti {
            sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = $1 \
                 AND break_glass_until IS NOT NULL AND break_glass_until > NOW())",
            )
            .bind(jti)
            .fetch_one(pool.get_ref())
            .await
            .unwrap_or(false)
        } else {
            false
        };

        if break_glass_active {
            crate::services::audit_service::log_action(
                &pool,
                claims.sub,
                "break_glass_read",
                Some("access_decision"),
                Some(patient_id),
                &req,
            )
            .await;
            // Skip the grant check. Records are still returned below.
            let records = get_records_by_patient(&pool, patient_id).await?;
            return Ok(HttpResponse::Ok().json(records));
        }

        let chain = crate::services::blockchain_service::has_active_patient_grant(
            &patient_id.to_string(),
            &claims.sub.to_string(),
            config.get_ref(),
        )
        .await;

        let (allowed, decision_action) = match chain {
            Some(true) => (true, "access_decision_chain_allow"),
            Some(false) => (false, "access_decision_chain_deny"),
            None => {
                // Chain unreachable. Fall back to DB and log clearly.
                eprintln!(
                    "[authz] chain unavailable for patient={} staff={}, falling back to DB",
                    patient_id, claims.sub
                );
                let db_has_grant: bool = sqlx::query_scalar::<_, bool>(
                    "SELECT EXISTS(\
                        SELECT 1 FROM access_permissions \
                        WHERE patient_id = $1 AND granted_to = $2 AND status = 'active' \
                        AND (expires_at IS NULL OR expires_at > NOW())\
                     )",
                )
                .bind(patient_id)
                .bind(claims.sub)
                .fetch_one(pool.get_ref())
                .await
                .unwrap_or(false);
                if db_has_grant {
                    (true, "access_decision_db_allow")
                } else {
                    (false, "access_decision_db_deny")
                }
            }
        };

        crate::services::audit_service::log_action(
            &pool,
            claims.sub,
            decision_action,
            Some("access_decision"),
            Some(patient_id),
            &req,
        )
        .await;

        if !allowed {
            return Err(AppError::Forbidden(
                "No active access grant for this patient".into(),
            ));
        }
    }

    let records = get_records_by_patient(&pool, patient_id).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[get("/api/records/{id}")]
async fn get(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    require_claims(&req)?;
    let id = path.into_inner();
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

    let vitals = sqlx::query_as::<_, crate::models::medical_record::Vital>(
        "SELECT * FROM vitals WHERE record_id = $1 ORDER BY taken_at DESC",
    )
        .bind(id)
        .fetch_all(pool.get_ref())
        .await?;

    let orders = sqlx::query_as::<_, crate::models::medical_record::Order>(
        "SELECT * FROM orders WHERE record_id = $1 ORDER BY ordered_at DESC",
    )
        .bind(id)
        .fetch_all(pool.get_ref())
        .await?;

    Ok(HttpResponse::Ok().json(crate::models::medical_record::RecordResponse {
        record,
        medications,
        allergies,
        vitals,
        orders,
        blockchain_verified,
        blockchain_tx_hash,
        receipt: None,
    }))
}

#[put("/api/records/{id}")]
async fn update(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<UpdateRecordRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "nurse", "admin"])?;
    let id = path.into_inner();
    let result = update_record(&pool, id, body.into_inner()).await?;
    log_action(&pool, claims.sub, "record_updated", Some("medical_record"), Some(id), &req).await;
    Ok(HttpResponse::Ok().json(result))
}

#[delete("/api/records/{id}")]
async fn delete(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["doctor", "admin"])?;
    let id = path.into_inner();
    delete_record(&pool, id).await?;
    log_action(&pool, claims.sub, "record_deleted", Some("medical_record"), Some(id), &req).await;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "Medical record deleted" })))
}

/// Issue a fresh verification receipt for a record. Any authenticated user;
/// patient-role users must own the record. The receipt contains decrypted
/// plaintext + chain metadata, enabling independent verification.
#[get("/api/records/{id}/receipt")]
async fn get_receipt(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    config: web::Data<crate::config::Config>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let id = path.into_inner();
    let record = get_record_by_id(&pool, id).await?;

    if claims.role == "patient" {
        let owner: Option<Uuid> = sqlx::query_scalar(
            "SELECT user_id FROM patients WHERE id = $1",
        )
        .bind(record.patient_id)
        .fetch_optional(pool.get_ref())
        .await?;
        if owner != Some(claims.sub) {
            return Err(AppError::Forbidden("Not your record".into()));
        }
    }

    let tx_hash = record.blockchain_tx_id.clone();
    // Version = 0 signals "check chain for current latest". A future story can
    // resolve this against get_latest_version_onchain without a signature change.
    let receipt = build_receipt(&record, 0, tx_hash, None, config.get_ref());
    Ok(HttpResponse::Ok().json(receipt))
}

pub fn record_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(create)
        .service(list_all)
        .service(list_by_patient)
        .service(get)
        .service(get_receipt)
        .service(update)
        .service(delete);
}
