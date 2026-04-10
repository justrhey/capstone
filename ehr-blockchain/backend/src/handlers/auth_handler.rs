use actix_web::{post, web, HttpResponse, Responder};
use crate::services::auth_service::{register_user, login_user, AppError};
use crate::models::{RegisterRequest, LoginRequest};
use crate::config::Config;
use sqlx::PgPool;

#[post("/api/auth/register")]
async fn register(
    pool: web::Data<PgPool>,
    body: web::Json<RegisterRequest>,
) -> Result<impl Responder, AppError> {
    let config = Config::from_env().map_err(|e| AppError::InternalError(e.to_string()))?;
    let result = register_user(&pool, body.into_inner(), &config).await?;
    Ok(HttpResponse::Created().json(result))
}

#[post("/api/auth/login")]
async fn login(
    pool: web::Data<PgPool>,
    body: web::Json<LoginRequest>,
) -> Result<impl Responder, AppError> {
    let config = Config::from_env().map_err(|e| AppError::InternalError(e.to_string()))?;
    let result = login_user(&pool, body.into_inner(), &config).await?;
    Ok(HttpResponse::Ok().json(result))
}

pub fn auth_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(register).service(login);
}
