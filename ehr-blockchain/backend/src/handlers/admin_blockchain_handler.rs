use actix_web::{post, web, HttpRequest, HttpResponse, Responder};
use sqlx::PgPool;

use crate::config::Config;
use crate::services::anchor_queue::{self, RetryResult, RetrySummary};
use crate::services::auth_service::{require_role, AppError};
use crate::services::blockchain_service;

#[post("/api/admin/blockchain/retry")]
async fn retry_pending(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> Result<impl Responder, AppError> {
    let claims = require_role(&req, &["admin"])?;

    let rows = anchor_queue::list_pending(pool.get_ref())
        .await
        .map_err(|e| AppError::InternalError(format!("queue read failed: {}", e)))?;

    let mut summary = RetrySummary {
        total: rows.len() as u32,
        ..Default::default()
    };

    for row in rows {
        let outcome = match row.action_type.as_str() {
            "store_hash" => retry_store_hash(&row, pool.get_ref(), config.get_ref()).await,
            "update_hash" => retry_update_hash(&row, pool.get_ref(), config.get_ref()).await,
            "grant_access" => retry_grant_access(&row, pool.get_ref(), config.get_ref()).await,
            "log_access" => retry_log_access(&row, pool.get_ref(), config.get_ref()).await,
            other => RetryResult {
                row_id: row.id,
                outcome: "failed",
                tx_hash: None,
                error: Some(format!("unsupported action_type: {}", other)),
            },
        };

        match outcome.outcome {
            "confirmed" => summary.confirmed += 1,
            "still_pending" => summary.still_pending += 1,
            _ => summary.failed += 1,
        }
        summary.results.push(outcome);
    }

    eprintln!(
        "[admin] blockchain retry triggered by user_id={} — total={} confirmed={} still_pending={} failed={}",
        claims.sub, summary.total, summary.confirmed, summary.still_pending, summary.failed
    );

    Ok(HttpResponse::Ok().json(summary))
}

async fn retry_store_hash(
    row: &anchor_queue::PendingRow,
    pool: &PgPool,
    config: &Config,
) -> RetryResult {
    let record_id = row.pending_payload.get("record_id").and_then(|v| v.as_str()).unwrap_or("");
    let patient_id = row.pending_payload.get("patient_id").and_then(|v| v.as_str()).unwrap_or("");
    let record_hash = row.pending_payload.get("record_hash").and_then(|v| v.as_str()).unwrap_or("");

    if record_id.is_empty() || patient_id.is_empty() || record_hash.is_empty() {
        let err = "malformed pending_payload (missing fields)".to_string();
        let _ = anchor_queue::mark_attempt_failed(pool, row.id, &err).await;
        return RetryResult {
            row_id: row.id,
            outcome: "failed",
            tx_hash: None,
            error: Some(err),
        };
    }

    match blockchain_service::store_record_hash_raw(pool, record_id, patient_id, record_hash, config).await {
        Some(tx) => {
            let _ = anchor_queue::mark_confirmed(pool, row.id, &tx.tx_hash).await;
            RetryResult {
                row_id: row.id,
                outcome: "confirmed",
                tx_hash: Some(tx.tx_hash),
                error: None,
            }
        }
        None => {
            let err = "soroban still unreachable".to_string();
            let _ = anchor_queue::mark_attempt_failed(pool, row.id, &err).await;
            RetryResult {
                row_id: row.id,
                outcome: "still_pending",
                tx_hash: None,
                error: Some(err),
            }
        }
    }
}

async fn retry_update_hash(
    row: &anchor_queue::PendingRow,
    pool: &PgPool,
    config: &Config,
) -> RetryResult {
    let record_id = row.pending_payload.get("record_id").and_then(|v| v.as_str()).unwrap_or("");
    let record_hash = row.pending_payload.get("record_hash").and_then(|v| v.as_str()).unwrap_or("");

    if record_id.is_empty() || record_hash.is_empty() {
        let err = "malformed pending_payload (missing fields)".to_string();
        let _ = anchor_queue::mark_attempt_failed(pool, row.id, &err).await;
        return RetryResult { row_id: row.id, outcome: "failed", tx_hash: None, error: Some(err) };
    }

    match blockchain_service::update_record_hash_raw(pool, record_id, record_hash, config).await {
        Some(tx) => {
            let _ = anchor_queue::mark_confirmed(pool, row.id, &tx.tx_hash).await;
            RetryResult { row_id: row.id, outcome: "confirmed", tx_hash: Some(tx.tx_hash), error: None }
        }
        None => {
            let err = "soroban still unreachable".to_string();
            let _ = anchor_queue::mark_attempt_failed(pool, row.id, &err).await;
            RetryResult { row_id: row.id, outcome: "still_pending", tx_hash: None, error: Some(err) }
        }
    }
}

async fn retry_grant_access(
    row: &anchor_queue::PendingRow,
    pool: &PgPool,
    config: &Config,
) -> RetryResult {
    let patient_id = row.pending_payload.get("patient_id").and_then(|v| v.as_str()).unwrap_or("");
    let granted_to = row.pending_payload.get("granted_to").and_then(|v| v.as_str()).unwrap_or("");
    let record_id = row.pending_payload.get("record_id").and_then(|v| v.as_str()).unwrap_or("");
    let duration = row.pending_payload.get("duration_seconds").and_then(|v| v.as_u64()).unwrap_or(0);

    if patient_id.is_empty() || granted_to.is_empty() || record_id.is_empty() || duration == 0 {
        let err = "malformed pending_payload (missing fields)".to_string();
        let _ = anchor_queue::mark_attempt_failed(pool, row.id, &err).await;
        return RetryResult { row_id: row.id, outcome: "failed", tx_hash: None, error: Some(err) };
    }

    match blockchain_service::grant_access_onchain_raw(pool, patient_id, granted_to, record_id, duration, config).await {
        Some(tx) => {
            let _ = anchor_queue::mark_confirmed(pool, row.id, &tx.tx_hash).await;
            RetryResult { row_id: row.id, outcome: "confirmed", tx_hash: Some(tx.tx_hash), error: None }
        }
        None => {
            let err = "soroban still unreachable".to_string();
            let _ = anchor_queue::mark_attempt_failed(pool, row.id, &err).await;
            RetryResult { row_id: row.id, outcome: "still_pending", tx_hash: None, error: Some(err) }
        }
    }
}

async fn retry_log_access(
    row: &anchor_queue::PendingRow,
    pool: &PgPool,
    config: &Config,
) -> RetryResult {
    let user_id = row.pending_payload.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
    let record_id = row.pending_payload.get("record_id").and_then(|v| v.as_str()).unwrap_or("");
    let action = row.pending_payload.get("action").and_then(|v| v.as_str()).unwrap_or("");

    if user_id.is_empty() || record_id.is_empty() || action.is_empty() {
        let err = "malformed pending_payload (missing fields)".to_string();
        let _ = anchor_queue::mark_attempt_failed(pool, row.id, &err).await;
        return RetryResult { row_id: row.id, outcome: "failed", tx_hash: None, error: Some(err) };
    }

    match blockchain_service::log_access_onchain_raw(pool, user_id, record_id, action, config).await {
        Some(anchor) => {
            let _ = anchor_queue::mark_confirmed(pool, row.id, &anchor.tx.tx_hash).await;
            RetryResult { row_id: row.id, outcome: "confirmed", tx_hash: Some(anchor.tx.tx_hash), error: None }
        }
        None => {
            let err = "soroban still unreachable".to_string();
            let _ = anchor_queue::mark_attempt_failed(pool, row.id, &err).await;
            RetryResult { row_id: row.id, outcome: "still_pending", tx_hash: None, error: Some(err) }
        }
    }
}

pub fn admin_blockchain_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(retry_pending);
}
