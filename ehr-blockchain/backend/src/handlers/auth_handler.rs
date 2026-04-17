use actix_web::{get, post, web, HttpResponse, Responder, HttpRequest};
use crate::services::auth_service::{
    register_user, login_user, generate_token, generate_token_with_jti, decode_token,
    require_claims, CURRENT_CONSENT_VERSION, AppError,
};
use crate::models::{RegisterRequest, LoginRequest, User};
use crate::config::Config;
use sqlx::PgPool;
use uuid::Uuid;

#[post("/api/auth/register")]
async fn register(
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<RegisterRequest>,
) -> Result<impl Responder, AppError> {
    let result = register_user(&pool, body.into_inner(), config.get_ref(), false).await?;
    Ok(HttpResponse::Created().json(result))
}

#[post("/api/auth/login")]
async fn login(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<LoginRequest>,
) -> Result<impl Responder, AppError> {
    // Rate-limit by client IP to blunt credential-stuffing attempts.
    let ip = req
        .connection_info()
        .realip_remote_addr()
        .unwrap_or("unknown")
        .to_string();
    if !crate::services::rate_limit::LOGIN_LIMITER.check(&ip) {
        crate::services::incident_service::record_incident(
            pool.get_ref(),
            "login_rate_limit",
            crate::services::incident_service::Severity::Medium,
            None,
            Some(&ip),
            &format!("Rate limit exceeded for IP {}", ip),
        )
        .await;
        return Err(AppError::TooManyRequests(
            "Too many login attempts. Try again in a minute.".into(),
        ));
    }

    let ua = req
        .headers()
        .get("User-Agent")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    let result = login_user(&pool, body.into_inner(), config.get_ref()).await;
    match result {
        Ok(mut ok) => {
            // SEC-2: create a session row and rewrite the JWT to carry its id as jti.
            let session_id: Uuid = sqlx::query_scalar(
                "INSERT INTO sessions (user_id, ip_address, user_agent, last_seen_at) \
                 VALUES ($1, $2, $3, NOW()) RETURNING id",
            )
            .bind(ok.user.id)
            .bind(&ip)
            .bind(&ua)
            .fetch_one(pool.get_ref())
            .await
            .map_err(|e| AppError::InternalError(format!("create session: {}", e)))?;

            // Reload full user to sign token (login_user only returns UserResponse).
            if let Ok(Some(full_user)) =
                sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
                    .bind(ok.user.id)
                    .fetch_optional(pool.get_ref())
                    .await
            {
                if let Ok(fresh) =
                    generate_token_with_jti(&full_user, config.get_ref(), Some(session_id))
                {
                    ok.token = fresh;
                }
            }

            crate::services::incident_service::on_login_success(
                pool.get_ref(),
                ok.user.id,
                Some(&ip),
            )
            .await;
            Ok(HttpResponse::Ok().json(ok))
        }
        Err(e) => {
            crate::services::incident_service::on_login_failure(pool.get_ref(), Some(&ip)).await;
            Err(e)
        }
    }
}

#[post("/api/auth/refresh")]
async fn refresh(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    // Auth routes are JWT-public, so decode the token here manually.
    let token = req
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or_else(|| AppError::Unauthorized("Missing token".into()))?;

    let claims = decode_token(token, config.get_ref())
        .map_err(|_| AppError::Unauthorized("Invalid or expired token".into()))?;

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(claims.sub)
        .fetch_optional(pool.get_ref())
        .await?
        .ok_or_else(|| AppError::Unauthorized("User no longer exists".into()))?;

    // Carry the existing jti forward so refresh doesn't create a new session.
    let new_token = generate_token_with_jti(&user, config.get_ref(), claims.jti)
        .map_err(|e| AppError::InternalError(format!("Failed to issue token: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "token": new_token })))
}

/// Public: returns the current privacy-notice version string so the
/// registration form can submit it with the user's acceptance.
#[get("/api/auth/consent-version")]
async fn consent_version() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "current": CURRENT_CONSENT_VERSION,
    }))
}

#[derive(Debug, serde::Deserialize)]
pub struct AcceptConsentRequest {
    pub consent_version: String,
}

/// Authenticated: record that the caller has accepted the current privacy
/// notice. Used by the Settings page after a re-consent flow is triggered.
#[post("/api/me/accept-consent")]
async fn accept_consent(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<AcceptConsentRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    if body.consent_version != CURRENT_CONSENT_VERSION {
        return Err(AppError::BadRequest(format!(
            "Stale consent version; current is {}",
            CURRENT_CONSENT_VERSION
        )));
    }
    sqlx::query(
        "UPDATE users SET consent_version = $1, consent_accepted_at = NOW() WHERE id = $2",
    )
    .bind(CURRENT_CONSENT_VERSION)
    .bind(claims.sub)
    .execute(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "consent_version": CURRENT_CONSENT_VERSION,
    })))
}

/// Authenticated: clear the caller's consent. Next protected action should be
/// blocked until they re-accept. For now the account remains usable but
/// `consent_current` on the user is false; the frontend uses that to force
/// re-consent on the next navigation.
#[post("/api/me/revoke-consent")]
async fn revoke_consent(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    sqlx::query(
        "UPDATE users SET consent_version = NULL, consent_accepted_at = NULL WHERE id = $1",
    )
    .bind(claims.sub)
    .execute(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "revoked": true,
    })))
}

/// Start 2FA enrollment: generates a new secret, stores it in `totp_pending_secret`
/// (encrypted), and returns the secret + otpauth:// URL for the authenticator app.
#[post("/api/auth/2fa/enroll")]
async fn totp_enroll(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;

    let secret_bytes = crate::services::totp_service::generate_secret_bytes();
    let secret_b32 = crate::services::totp_service::secret_to_base32(&secret_bytes);
    let encrypted = crate::services::encryption::encrypt_field(&secret_b32, &config.encryption_key)
        .map_err(|e| AppError::InternalError(format!("Encrypt TOTP secret: {}", e)))?;

    sqlx::query("UPDATE users SET totp_pending_secret = $1 WHERE id = $2")
        .bind(&encrypted)
        .bind(claims.sub)
        .execute(pool.get_ref())
        .await?;

    let url = crate::services::totp_service::build_otpauth_url(&secret_b32, &claims.email);
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "secret_base32": secret_b32,
        "otpauth_url": url,
    })))
}

#[derive(Debug, serde::Deserialize)]
pub struct TotpConfirmRequest {
    pub code: String,
}

/// Confirm enrollment by checking a code against the pending secret; on success
/// move it to `totp_secret` and stamp `totp_enrolled_at`.
#[post("/api/auth/2fa/confirm")]
async fn totp_confirm(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<TotpConfirmRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;

    let pending: Option<String> =
        sqlx::query_scalar("SELECT totp_pending_secret FROM users WHERE id = $1")
            .bind(claims.sub)
            .fetch_one(pool.get_ref())
            .await?;
    let enc_pending = pending.ok_or_else(|| AppError::BadRequest("No pending enrollment".into()))?;
    let plain_b32 =
        crate::services::encryption::decrypt_field(&enc_pending, &config.encryption_key);
    let bytes = crate::services::totp_service::secret_from_base32(&plain_b32)
        .ok_or_else(|| AppError::InternalError("Pending secret malformed".into()))?;

    if !crate::services::totp_service::verify_code(&bytes, &body.code) {
        return Err(AppError::Unauthorized("Invalid OTP code".into()));
    }

    sqlx::query(
        "UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, \
         totp_enrolled_at = NOW() WHERE id = $1",
    )
    .bind(claims.sub)
    .execute(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "totp_enabled": true })))
}

#[derive(Debug, serde::Deserialize)]
pub struct TotpDisableRequest {
    pub code: String,
}

/// Disable 2FA. Requires a fresh OTP so a stolen session can't do this silently.
#[post("/api/auth/2fa/disable")]
async fn totp_disable(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    body: web::Json<TotpDisableRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;

    let current: Option<String> =
        sqlx::query_scalar("SELECT totp_secret FROM users WHERE id = $1")
            .bind(claims.sub)
            .fetch_one(pool.get_ref())
            .await?;
    let enc = current.ok_or_else(|| AppError::BadRequest("2FA is not enabled".into()))?;
    let plain_b32 = crate::services::encryption::decrypt_field(&enc, &config.encryption_key);
    let bytes = crate::services::totp_service::secret_from_base32(&plain_b32)
        .ok_or_else(|| AppError::InternalError("Stored secret malformed".into()))?;
    if !crate::services::totp_service::verify_code(&bytes, &body.code) {
        return Err(AppError::Unauthorized("Invalid OTP code".into()));
    }

    sqlx::query(
        "UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, \
         totp_enrolled_at = NULL WHERE id = $1",
    )
    .bind(claims.sub)
    .execute(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "totp_enabled": false })))
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct SessionRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub revoked_at: Option<chrono::DateTime<chrono::Utc>>,
    pub revoked_by: Option<Uuid>,
    pub last_seen_at: Option<chrono::DateTime<chrono::Utc>>,
    pub break_glass_until: Option<chrono::DateTime<chrono::Utc>>,
    pub break_glass_reason: Option<String>,
}

/// List the caller's own sessions (active + recent). Current session is
/// identified by `claims.jti` so the UI can label "this device".
#[get("/api/me/sessions")]
async fn list_sessions(req: HttpRequest, pool: web::Data<PgPool>) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let rows = sqlx::query_as::<_, SessionRow>(
        "SELECT * FROM sessions WHERE user_id = $1 ORDER BY (revoked_at IS NULL) DESC, created_at DESC LIMIT 100",
    )
    .bind(claims.sub)
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "current_session_id": claims.jti,
        "sessions": rows,
    })))
}

#[derive(Debug, serde::Deserialize)]
pub struct BreakGlassRequest {
    pub reason: String,
}

/// SEC-3: staff-only emergency access toggle.
/// Sets a 30-minute window on the caller's current session; during that window
/// `list_by_patient` bypasses the check_access gate and logs each read at high severity.
#[post("/api/auth/break-glass")]
async fn break_glass(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<BreakGlassRequest>,
) -> Result<impl Responder, AppError> {
    let claims = crate::services::auth_service::require_role(
        &req,
        &["doctor", "nurse", "admin"],
    )?;
    let reason = body.reason.trim();
    if reason.len() < 8 {
        return Err(AppError::BadRequest(
            "Provide a substantive reason (≥8 chars) for break-glass access.".into(),
        ));
    }
    let Some(jti) = claims.jti else {
        return Err(AppError::Unauthorized(
            "Break-glass requires a session-bound token (log out and back in).".into(),
        ));
    };
    sqlx::query(
        "UPDATE sessions SET break_glass_until = NOW() + INTERVAL '30 minutes', \
         break_glass_reason = $1 WHERE id = $2 AND user_id = $3",
    )
    .bind(reason)
    .bind(jti)
    .bind(claims.sub)
    .execute(pool.get_ref())
    .await?;

    crate::services::audit_service::log_action(
        pool.get_ref(),
        claims.sub,
        "break_glass_activated",
        Some("session"),
        Some(jti),
        &req,
    )
    .await;
    crate::services::incident_service::record_incident(
        pool.get_ref(),
        "break_glass_activated",
        crate::services::incident_service::Severity::High,
        Some(claims.sub),
        None,
        &format!("User activated break-glass: {}", reason),
    )
    .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "break_glass_until_minutes": 30,
        "reason": reason,
    })))
}

#[get("/api/admin/break-glass/active")]
async fn break_glass_active(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    crate::services::auth_service::require_role(&req, &["admin", "auditor"])?;
    let rows = sqlx::query_as::<_, SessionRow>(
        "SELECT * FROM sessions WHERE break_glass_until IS NOT NULL AND break_glass_until > NOW() \
         AND revoked_at IS NULL ORDER BY break_glass_until DESC",
    )
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "active_count": rows.len(),
        "sessions": rows,
    })))
}

#[post("/api/me/sessions/{id}/revoke")]
async fn revoke_session(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    let claims = require_claims(&req)?;
    let id = path.into_inner();
    let result = sqlx::query(
        "UPDATE sessions SET revoked_at = NOW(), revoked_by = $1 \
         WHERE id = $2 AND user_id = $1 AND revoked_at IS NULL",
    )
    .bind(claims.sub)
    .bind(id)
    .execute(pool.get_ref())
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Active session not found".into()));
    }
    Ok(HttpResponse::Ok().json(serde_json::json!({ "revoked": id })))
}

pub fn auth_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(register)
        .service(login)
        .service(refresh)
        .service(consent_version)
        .service(accept_consent)
        .service(revoke_consent)
        .service(totp_enroll)
        .service(totp_confirm)
        .service(totp_disable)
        .service(list_sessions)
        .service(revoke_session)
        .service(break_glass)
        .service(break_glass_active);
}
