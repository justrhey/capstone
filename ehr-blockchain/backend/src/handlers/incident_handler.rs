use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::services::auth_service::{require_role, AppError};
use crate::services::incident_service::Incident;
use crate::services::pagination::{Page, PageParams};

/// List incidents, newest first, optionally filtered to unresolved only.
#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub unresolved: Option<bool>,
}

#[get("/api/incidents")]
async fn list_incidents(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    params: web::Query<PageParams>,
    filter: web::Query<ListParams>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["admin", "auditor"])?;
    let page = Page::from_params(&params);

    let rows = if filter.unresolved.unwrap_or(false) {
        sqlx::query_as::<_, Incident>(
            "SELECT * FROM incidents WHERE resolved_at IS NULL \
             ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(pool.get_ref())
        .await?
    } else {
        sqlx::query_as::<_, Incident>(
            "SELECT * FROM incidents ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(pool.get_ref())
        .await?
    };

    let unresolved_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM incidents WHERE resolved_at IS NULL",
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "incidents": rows,
        "unresolved_count": unresolved_count,
    })))
}

#[derive(Debug, Deserialize)]
pub struct ResolveRequest {
    pub note: Option<String>,
}

#[post("/api/incidents/{id}/resolve")]
async fn resolve_incident(
    req: HttpRequest,
    path: web::Path<Uuid>,
    pool: web::Data<PgPool>,
    body: web::Json<ResolveRequest>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;
    let id = path.into_inner();

    let result = sqlx::query(
        "UPDATE incidents SET resolved_at = NOW(), resolved_by = $1, resolution_note = $2 \
         WHERE id = $3 AND resolved_at IS NULL",
    )
    .bind(claims.sub)
    .bind(&body.note)
    .bind(id)
    .execute(pool.get_ref())
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Open incident not found".into()));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "resolved": id })))
}

pub fn incident_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(list_incidents).service(resolve_incident);
}
