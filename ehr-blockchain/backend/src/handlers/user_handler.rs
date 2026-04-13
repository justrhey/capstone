use actix_web::{web, HttpResponse, Responder, get, delete, put};
use crate::services::auth_service::list_users;
use crate::services::auth_service::AppError;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub struct UpdateUserRequest {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
}

#[get("/api/users")]
async fn list(pool: web::Data<PgPool>) -> Result<impl Responder, AppError> {
    let users = list_users(&pool).await?;
    Ok(HttpResponse::Ok().json(users))
}

#[get("/api/info")]
async fn get_info() -> impl Responder {
    let info = r#"# EHR Blockchain System - Development Status

## What Was Done So Far

### Backend (Rust + Actix Web)
- User authentication with JWT (register/login)
- Patient CRUD API with `/api/patients/with-account` endpoint for creating patient + user together
- Medical Records CRUD API with blockchain hash storage
- Blockchain integration using Stellar Soroban (stores SHA-256 hashes on Stellar Testnet)
- Smart contracts deployed to Stellar Testnet (RecordRegistry, AccessManager, AuditTrail)
- CORS middleware enabled
- User management endpoints (list, update, delete)

### Frontend (React + TypeScript + Vite + Tailwind CSS)
- Login page with role-based routing
- Dashboard with role-based stats
- Patients page with search + "Create Patient with Account" form
- Records page with search + create form + blockchain verification badges
- My Records page (patient view with security fix - filters by user_id)
- Permissions page
- Audit Logs page
- Create Staff page (admin only)
- Layout with SVG icons

### Database (PostgreSQL 18)
- 8 migration tables created (users, patients, medical_records, medications, allergies, permissions, audit_logs, blockchain_transactions)
- Patients can be linked to user accounts via user_id

## What's Still Needed to Develop

1. **Dashboard Stats Fix** - Stats may not load properly for some roles (needs useEffect timing fixes)

2. **My Records Security** - The page correctly filters by patient.user_id matching user.id. If patients see wrong records, it's due to incorrect data linkage in the database

3. **Permissions System** - The Permissions page exists but needs actual backend implementation for granting/revoking access to medical records

4. **Audit Logs** - The AuditLogs page exists but needs backend implementation to track who accessed what records

5. **Patient Profile Update** - Need PUT endpoint for updating patient information

6. **Record Update/Delete** - No endpoints to update or delete medical records

7. **Blockchain Verification UI** - Verification badges show but need working verification endpoint

8. **Better Error Handling** - Add more descriptive error messages

9. **Input Validation** - Add more robust input validation for all endpoints

10. **Pagination** - Add pagination for patients and records lists

11. **Search Improvements** - Add more search/filter options

12. **PDF Export** - Ability to export medical records as PDF"#;
    HttpResponse::Ok().json(serde_json::json!({ "info": info }))
}

#[delete("/api/users/{id}")]
async fn delete_user(
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let id = path.into_inner();
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(pool.get_ref())
        .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "User deleted" })))
}

#[put("/api/users/{id}")]
async fn update_user(
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<UpdateUserRequest>,
) -> Result<impl Responder, AppError> {
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
    
    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "User updated" })))
}

pub fn user_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list).service(delete_user).service(update_user);
}