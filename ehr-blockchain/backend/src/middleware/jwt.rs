use actix_web::dev::{ServiceRequest, ServiceResponse, Transform, Service};
use actix_web::{Error, HttpMessage};
use futures::future::{ok, Ready};
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use crate::config::Config;
use crate::services::auth_service::decode_token;

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
        ok(JwtMiddlewareMiddleware { service })
    }
}

pub struct JwtMiddlewareMiddleware<S> {
    service: S,
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
        let auth_header = req.headers().get("Authorization");

        if let Some(header) = auth_header {
            if let Ok(header_str) = header.to_str() {
                if let Some(token) = header_str.strip_prefix("Bearer ") {
                    let config = Config::from_env().unwrap();
                    if let Ok(claims) = decode_token(token, &config) {
                        req.extensions_mut().insert(claims);
                        let fut = self.service.call(req);
                        return Box::pin(async move { fut.await });
                    }
                }
            }
        }

        Box::pin(async {
            Err(actix_web::error::ErrorUnauthorized("Missing or invalid token"))
        })
    }
}