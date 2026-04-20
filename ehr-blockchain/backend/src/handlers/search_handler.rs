use actix_web::{get, web, HttpRequest, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::config::Config;
use crate::services::auth_service::{require_role, AppError};
use crate::services::encryption::decrypt_field_opt;

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct PatientRow {
    id: Uuid,
    user_id: Option<Uuid>,
    first_name: Option<String>,
    last_name: Option<String>,
}

/// Global patient search. Names are encrypted at rest, so we fetch and decrypt
/// every active patient then filter in-memory. For a capstone-scale DB this is
/// fine; a production deployment would need encrypted-search indexing
/// (e.g. tokenized blind indexes) to scale.
#[get("/api/search/patients")]
async fn search_patients(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    params: web::Query<SearchParams>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["doctor", "nurse", "admin", "auditor"])?;
    let q = params.q.clone().unwrap_or_default().to_lowercase();
    let needle = q.trim();
    if needle.is_empty() {
        return Ok(HttpResponse::Ok().json(serde_json::json!({ "results": [] })));
    }

    let rows = sqlx::query_as::<_, PatientRow>(
        "SELECT id, user_id, first_name, last_name FROM patients \
         WHERE deleted_at IS NULL LIMIT 2000",
    )
    .fetch_all(pool.get_ref())
    .await?;

    let matches: Vec<serde_json::Value> = rows
        .into_iter()
        .filter_map(|r| {
            let first = decrypt_field_opt(&r.first_name, &config.encryption_key).unwrap_or_default();
            let last = decrypt_field_opt(&r.last_name, &config.encryption_key).unwrap_or_default();
            let full = format!("{} {}", first, last).to_lowercase();
            let id_str = r.id.to_string();
            if full.contains(needle) || id_str.starts_with(needle) {
                Some(serde_json::json!({
                    "id": r.id,
                    "user_id": r.user_id,
                    "first_name": first,
                    "last_name": last,
                }))
            } else {
                None
            }
        })
        .take(25)
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({ "results": matches })))
}

pub fn search_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(search_patients);
}
