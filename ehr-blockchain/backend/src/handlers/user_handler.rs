use actix_web::{web, HttpResponse, Responder, get};
use crate::services::auth_service::list_users;
use crate::services::auth_service::AppError;
use sqlx::PgPool;

#[get("/api/users")]
async fn list(pool: web::Data<PgPool>) -> Result<impl Responder, AppError> {
    let users = list_users(&pool).await?;
    Ok(HttpResponse::Ok().json(users))
}

pub fn user_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list);
}