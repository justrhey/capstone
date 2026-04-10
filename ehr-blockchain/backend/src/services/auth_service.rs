use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use chrono::Utc;
use crate::models::{Claims, RegisterRequest, LoginRequest, AuthResponse, User, UserResponse};
use crate::config::Config;
use sqlx::PgPool;

pub fn hash_password(password: &str) -> Result<String, bcrypt::BcryptError> {
    hash(password, DEFAULT_COST)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, bcrypt::BcryptError> {
    verify(password, hash)
}

pub fn generate_token(user: &User, config: &Config) -> Result<String, jsonwebtoken::errors::Error> {
    let expiration = Utc::now()
        .checked_add_signed(chrono::Duration::minutes(config.jwt_expiration_minutes))
        .expect("Valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user.id,
        email: user.email.clone(),
        role: user.role.clone(),
        exp: expiration,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
}

pub fn decode_token(token: &str, config: &Config) -> Result<Claims, jsonwebtoken::errors::Error> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}

pub async fn register_user(
    pool: &PgPool,
    req: RegisterRequest,
    config: &Config,
) -> Result<AuthResponse, AppError> {
    let valid_roles = ["patient", "doctor", "nurse", "admin", "auditor"];
    if !valid_roles.contains(&req.role.as_str()) {
        return Err(AppError::BadRequest("Invalid role specified".into()));
    }

    let existing = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_optional(pool)
        .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    let password_hash = hash_password(&req.password)
        .map_err(|e| AppError::InternalError(format!("Failed to hash password: {}", e)))?;

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5) RETURNING *"
    )
        .bind(&req.email)
        .bind(&password_hash)
        .bind(&req.role)
        .bind(&req.first_name)
        .bind(&req.last_name)
        .fetch_one(pool)
        .await?;

    let token = generate_token(&user, config)
        .map_err(|e| AppError::InternalError(format!("Failed to generate token: {}", e)))?;

    Ok(AuthResponse {
        token,
        user: UserResponse::from(&user),
    })
}

pub async fn login_user(
    pool: &PgPool,
    req: LoginRequest,
    config: &Config,
) -> Result<AuthResponse, AppError> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_optional(pool)
        .await?;

    let user = user.ok_or_else(|| AppError::Unauthorized("Invalid email or password".into()))?;

    let valid = verify_password(&req.password, &user.password_hash)
        .map_err(|e| AppError::InternalError(format!("Password verification error: {}", e)))?;

    if !valid {
        return Err(AppError::Unauthorized("Invalid email or password".into()));
    }

    let token = generate_token(&user, config)
        .map_err(|e| AppError::InternalError(format!("Failed to generate token: {}", e)))?;

    Ok(AuthResponse {
        token,
        user: UserResponse::from(&user),
    })
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Internal error: {0}")]
    InternalError(String),
}

impl actix_web::ResponseError for AppError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            AppError::Unauthorized(_) => actix_web::http::StatusCode::UNAUTHORIZED,
            AppError::Forbidden(_) => actix_web::http::StatusCode::FORBIDDEN,
            AppError::NotFound(_) => actix_web::http::StatusCode::NOT_FOUND,
            AppError::Conflict(_) => actix_web::http::StatusCode::CONFLICT,
            AppError::BadRequest(_) => actix_web::http::StatusCode::BAD_REQUEST,
            _ => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}