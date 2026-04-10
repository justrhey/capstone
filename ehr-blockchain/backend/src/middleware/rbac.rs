use actix_web::dev::{ServiceRequest, ServiceResponse, Transform, Service};
use actix_web::Error;
use futures::future::{ok, Ready};
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use crate::models::Claims;

pub struct RoleGuard {
    pub allowed_roles: Vec<String>,
}

impl RoleGuard {
    pub fn new(roles: Vec<&str>) -> Self {
        Self {
            allowed_roles: roles.into_iter().map(String::from).collect(),
        }
    }
}

impl<S, B> Transform<S, ServiceRequest> for RoleGuard
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = RoleGuardMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(RoleGuardMiddleware {
            service,
            allowed_roles: self.allowed_roles.clone(),
        })
    }
}

pub struct RoleGuardMiddleware<S> {
    service: S,
    allowed_roles: Vec<String>,
}

impl<S, B> Service<ServiceRequest> for RoleGuardMiddleware<S>
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
        let allowed = self.allowed_roles.clone();

        let claims = req.extensions().get::<Claims>();
        if let Some(claims) = claims {
            if allowed.contains(&claims.role) {
                let fut = self.service.call(req);
                return Box::pin(async move { fut.await });
            }
        }

        Box::pin(async {
            Err(actix_web::error::ErrorForbidden("Insufficient permissions"))
        })
    }
}