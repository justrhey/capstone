use actix_web::{web, HttpResponse, Responder, get, post, delete, put, HttpRequest};
use crate::services::auth_service::{list_users, register_user, require_role, AppError};
use crate::services::audit_service::log_action;
use crate::services::pagination::{Page, PageParams};
use crate::models::RegisterRequest;
use crate::config::Config;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub struct UpdateUserRequest {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
}

#[get("/api/users")]
async fn list(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    params: web::Query<PageParams>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["admin"])?;
    let users = list_users(&pool, Page::from_params(&params)).await?;
    Ok(HttpResponse::Ok().json(users))
}

#[derive(serde::Serialize, sqlx::FromRow)]
struct StaffLite {
    id: Uuid,
    email: String,
    first_name: String,
    last_name: String,
    role: String,
}

#[get("/api/users/staff")]
async fn list_staff(req: HttpRequest, pool: web::Data<PgPool>) -> Result<impl Responder, AppError> {
    crate::services::auth_service::require_claims(&req)?;
    let staff = sqlx::query_as::<_, StaffLite>(
        "SELECT id, email, first_name, last_name, role FROM users \
         WHERE role IN ('doctor','nurse','auditor') ORDER BY last_name, first_name",
    )
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(staff))
}

#[post("/api/users/staff")]
async fn create_staff(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<RegisterRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;
    if body.role == "patient" {
        return Err(AppError::BadRequest(
            "Use /api/auth/register for patient accounts".into(),
        ));
    }
    let result = register_user(&pool, body.into_inner(), config.get_ref(), true).await?;
    log_action(
        &pool,
        claims.sub,
        "staff_created",
        Some("user"),
        Some(result.user.id),
        &req,
    )
    .await;
    Ok(HttpResponse::Created().json(result))
}

#[get("/api/info")]
async fn get_info() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "name": "EHR Blockchain System API",
        "version": env!("CARGO_PKG_VERSION"),
        "features": {
            "authentication": "JWT (HS256)",
            "authorization": "role-based (patient, doctor, nurse, admin, auditor) with resource-level checks",
            "encryption": "AES-256-GCM for patient PII and record diagnosis/treatment/notes",
            "hashing": "SHA-256 for record integrity",
            "blockchain": "Stellar Soroban (Testnet) with graceful fallback if CLI unavailable",
            "audit": "DB table written on all mutations (user_id, action, resource_type, resource_id, ip)",
        },
        "endpoints": {
            "auth": ["POST /api/auth/login", "POST /api/auth/register"],
            "patients": ["GET /api/patients", "POST /api/patients", "GET /api/patients/:id",
                         "PUT /api/patients/:id", "DELETE /api/patients/:id",
                         "POST /api/patients/with-account"],
            "records": ["GET /api/records", "POST /api/records", "GET /api/records/:id",
                        "PUT /api/records/:id", "DELETE /api/records/:id",
                        "GET /api/patients/:id/records"],
            "permissions": ["GET /api/permissions", "POST /api/permissions",
                            "DELETE /api/permissions/:id",
                            "GET /api/patients/:id/permissions"],
            "audit": ["GET /api/audit/logs"],
            "verify": ["POST /api/verify", "GET /api/records/:id/verify"],
            "users": ["GET /api/users", "GET /api/users/staff",
                      "PUT /api/users/:id", "DELETE /api/users/:id"],
        },
    }))
}

#[delete("/api/users/{id}")]
async fn delete_user(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;
    let id = path.into_inner();
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(pool.get_ref())
        .await?;
    log_action(&pool, claims.sub, "user_deleted", Some("user"), Some(id), &req).await;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "User deleted" })))
}

#[put("/api/users/{id}")]
async fn update_user(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<UpdateUserRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;
    let id = path.into_inner();
    
    if let Some(ref first_name) = body.first_name {
        sqlx::query("UPDATE users SET first_name = $1 WHERE id = $2")
            .bind(first_name)
            .bind(id)
            .execute(pool.get_ref())
            .await?;
    }
    
    if let Some(ref last_name) = body.last_name {
        sqlx::query("UPDATE users SET last_name = $1 WHERE id = $2")
            .bind(last_name)
            .bind(id)
            .execute(pool.get_ref())
            .await?;
    }
    
    if let Some(ref email) = body.email {
        sqlx::query("UPDATE users SET email = $1 WHERE id = $2")
            .bind(email)
            .bind(id)
            .execute(pool.get_ref())
            .await?;
    }

    log_action(&pool, claims.sub, "user_updated", Some("user"), Some(id), &req).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "User updated" })))
}

pub fn user_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list)
        .service(list_staff)
        .service(create_staff)
        .service(delete_user)
        .service(update_user)
        .service(get_info);
}