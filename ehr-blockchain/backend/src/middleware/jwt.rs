use actix_web::dev::{Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::web;
use actix_web::{Error, HttpMessage};
use futures::future::{ok, Ready};
use sqlx::PgPool;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll};

use crate::config::Config;
use crate::services::auth_service::decode_token;

fn is_public_path(path: &str) -> bool {
    path == "/"
        || path == "/health"
        || path.starts_with("/api/auth/")
}

pub struct JwtMiddleware;

impl<S, B> Transform<S, ServiceRequest> for JwtMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = JwtMiddlewareMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(JwtMiddlewareMiddleware { service: Rc::new(service) })
    }
}

pub struct JwtMiddlewareMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for JwtMiddlewareMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let svc = Rc::clone(&self.service);
        Box::pin(async move {
            // Short-circuit: CORS preflight + public paths never need auth.
            if req.method() == actix_web::http::Method::OPTIONS || is_public_path(req.path()) {
                return svc.call(req).await;
            }

            let token = req
                .headers()
                .get("Authorization")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.strip_prefix("Bearer ").map(|t| t.to_string()));

            let config = req.app_data::<web::Data<Config>>().cloned();
            let pool = req.app_data::<web::Data<PgPool>>().cloned();

            let Some(config) = config else {
                return Err(actix_web::error::ErrorInternalServerError("Config not wired"));
            };
            let Some(token) = token else {
                return Err(actix_web::error::ErrorUnauthorized("Missing token"));
            };

            let claims = match decode_token(&token, config.get_ref()) {
                Ok(c) => c,
                Err(_) => return Err(actix_web::error::ErrorUnauthorized("Invalid token")),
            };

            // SEC-2: enforce per-device revocation by checking the session row.
            // A missing `jti` in the token is an older-style token; accept it
            // for backward compatibility (tokens issued before this migration
            // did not carry a jti and were not bound to a session row).
            if let (Some(jti), Some(pool)) = (claims.jti, pool) {
                let active: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = $1 AND revoked_at IS NULL)",
                )
                .bind(jti)
                .fetch_one(pool.get_ref())
                .await
                .unwrap_or(false);
                if !active {
                    return Err(actix_web::error::ErrorUnauthorized("Session revoked"));
                }
            }

            req.extensions_mut().insert(claims);
            svc.call(req).await
        })
    }
}
