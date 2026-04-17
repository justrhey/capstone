use actix_web::{HttpMessage, HttpRequest};
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use chrono::Utc;
use crate::models::{Claims, RegisterRequest, LoginRequest, AuthResponse, User, UserResponse};
use crate::config::Config;
use sqlx::PgPool;

/// Current privacy-notice version. Bumping this forces every user to
/// re-consent on their next login. Record of what was accepted lives in
/// `users.consent_version` + `users.consent_accepted_at`.
pub const CURRENT_CONSENT_VERSION: &str = "2026-04-17";

pub fn require_claims(req: &HttpRequest) -> Result<Claims, AppError> {
    let ext = req.extensions();
    ext.get::<Claims>()
        .cloned()
        .ok_or_else(|| AppError::Unauthorized("Missing authentication".into()))
}

pub fn require_role(req: &HttpRequest, allowed: &[&str]) -> Result<Claims, AppError> {
    let claims = require_claims(req)?;
    if !allowed.iter().any(|r| *r == claims.role.as_str()) {
        return Err(AppError::Forbidden("Insufficient permissions".into()));
    }
    Ok(claims)
}

pub fn hash_password(password: &str) -> Result<String, bcrypt::BcryptError> {
    hash(password, DEFAULT_COST)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, bcrypt::BcryptError> {
    verify(password, hash)
}

pub fn generate_token(user: &User, config: &Config) -> Result<String, jsonwebtoken::errors::Error> {
    generate_token_with_jti(user, config, None)
}

pub fn generate_token_with_jti(
    user: &User,
    config: &Config,
    jti: Option<uuid::Uuid>,
) -> Result<String, jsonwebtoken::errors::Error> {
    let expiration = Utc::now()
        .checked_add_signed(chrono::Duration::minutes(config.jwt_expiration_minutes))
        .expect("Valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user.id,
        email: user.email.clone(),
        role: user.role.clone(),
        exp: expiration,
        jti,
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

fn is_valid_email(s: &str) -> bool {
    // Minimal RFC-light check: something@something.tld (no spaces).
    let s = s.trim();
    if s.len() < 5 || s.len() > 254 || s.contains(char::is_whitespace) {
        return false;
    }
    let Some((local, domain)) = s.split_once('@') else { return false };
    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

/// Register a new user. `allow_privileged_role` gates non-patient registration —
/// the public /api/auth/register endpoint calls with `false`, admin-driven staff
/// creation calls with `true`.
pub async fn register_user(
    pool: &PgPool,
    req: RegisterRequest,
    config: &Config,
    allow_privileged_role: bool,
) -> Result<AuthResponse, AppError> {
    let valid_roles = ["patient", "doctor", "nurse", "admin", "auditor"];
    if !valid_roles.contains(&req.role.as_str()) {
        return Err(AppError::BadRequest("Invalid role specified".into()));
    }
    if !allow_privileged_role && req.role != "patient" {
        return Err(AppError::Forbidden(
            "Only patient self-registration is allowed. Staff accounts are created by admins.".into(),
        ));
    }

    if !is_valid_email(&req.email) {
        return Err(AppError::BadRequest("Invalid email format".into()));
    }

    let trim_len = |s: &str| s.trim().chars().count();
    if trim_len(&req.first_name) == 0 || trim_len(&req.first_name) > 100 {
        return Err(AppError::BadRequest("first_name must be 1-100 characters".into()));
    }
    if trim_len(&req.last_name) == 0 || trim_len(&req.last_name) > 100 {
        return Err(AppError::BadRequest("last_name must be 1-100 characters".into()));
    }

    if req.password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }

    // CMP-1: require the client to explicitly acknowledge the current privacy notice.
    match req.consent_version.as_deref() {
        Some(v) if v == CURRENT_CONSENT_VERSION => {}
        Some(_) => {
            return Err(AppError::BadRequest(format!(
                "Stale consent version. Current is {}.",
                CURRENT_CONSENT_VERSION
            )));
        }
        None => {
            return Err(AppError::BadRequest(
                "consent_version is required — you must accept the privacy notice to register.".into(),
            ));
        }
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
        "INSERT INTO users (email, password_hash, role, first_name, last_name, consent_version, consent_accepted_at) \
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *",
    )
        .bind(&req.email)
        .bind(&password_hash)
        .bind(&req.role)
        .bind(&req.first_name)
        .bind(&req.last_name)
        .bind(CURRENT_CONSENT_VERSION)
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

    if user.deleted_at.is_some() {
        return Err(AppError::Unauthorized("Account has been closed.".into()));
    }

    let valid = verify_password(&req.password, &user.password_hash)
        .map_err(|e| AppError::InternalError(format!("Password verification error: {}", e)))?;

    if !valid {
        return Err(AppError::Unauthorized("Invalid email or password".into()));
    }

    // SEC-1: if 2FA is enrolled, the client must present a valid OTP.
    if let Some(enc_secret) = user.totp_secret.as_deref() {
        let plain_b32 = crate::services::encryption::decrypt_field(enc_secret, &config.encryption_key);
        let otp = req
            .otp
            .as_deref()
            .ok_or_else(|| AppError::Unauthorized("OTP required".into()))?;
        let secret_bytes = crate::services::totp_service::secret_from_base32(&plain_b32)
            .ok_or_else(|| AppError::InternalError("Stored TOTP secret is malformed".into()))?;
        if !crate::services::totp_service::verify_code(&secret_bytes, otp) {
            return Err(AppError::Unauthorized("Invalid OTP code".into()));
        }
    }

    let token = generate_token(&user, config)
        .map_err(|e| AppError::InternalError(format!("Failed to generate token: {}", e)))?;

    Ok(AuthResponse {
        token,
        user: UserResponse::from(&user),
    })
}

pub async fn list_users(
    pool: &PgPool,
    page: crate::services::pagination::Page,
) -> Result<Vec<User>, AppError> {
    let users = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    )
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(pool)
        .await?;

    Ok(users)
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
    #[error("Too many requests: {0}")]
    TooManyRequests(String),
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
            AppError::TooManyRequests(_) => actix_web::http::StatusCode::TOO_MANY_REQUESTS,
            _ => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_validator_accepts_normal_addresses() {
        assert!(is_valid_email("user@example.com"));
        assert!(is_valid_email("first.last+tag@sub.example.co.uk"));
    }

    #[test]
    fn email_validator_rejects_malformed() {
        assert!(!is_valid_email(""));
        assert!(!is_valid_email("no-at-sign"));
        assert!(!is_valid_email("@missing-local.com"));
        assert!(!is_valid_email("missing-domain@"));
        assert!(!is_valid_email("no-dot@example"));
        assert!(!is_valid_email("trailing-dot@example."));
        assert!(!is_valid_email("leading-dot@.example.com"));
        assert!(!is_valid_email("space inside@example.com"));
    }
}