//! Persistent queue for blockchain anchor failures.
//!
//! When a `services/blockchain_service` call cannot reach Soroban (CLI missing,
//! RPC down, multi-sig helper failed), it inserts a `blockchain_transactions`
//! row with `status='pending'` and the original args serialized into
//! `pending_payload` JSONB. The admin retry endpoint reads pending rows and
//! re-dispatches them.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;

#[derive(Debug, thiserror::Error)]
pub enum QueueError {
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingRow {
    pub id: i64,
    pub contract_id: String,
    pub action_type: String,
    pub pending_payload: Value,
    pub attempts: i32,
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RetryResult {
    pub row_id: i64,
    pub outcome: &'static str, // "confirmed" | "still_pending" | "failed"
    pub tx_hash: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Default)]
pub struct RetrySummary {
    pub total: u32,
    pub confirmed: u32,
    pub still_pending: u32,
    pub failed: u32,
    pub results: Vec<RetryResult>,
}

/// Insert a pending anchor row. `contract_id` and `action_type` mirror the
/// blockchain_transactions schema. `pending_payload` is whatever the caller
/// needs to re-build the call (typically a JSON object of the original args).
pub async fn enqueue_pending(
    pool: &PgPool,
    contract_id: &str,
    action_type: &str,
    pending_payload: Value,
    last_error: &str,
) -> Result<i64, QueueError> {
    let row: (i64,) = sqlx::query_as(
        "INSERT INTO blockchain_transactions \
         (tx_hash, contract_id, action_type, payload, status, attempts, last_error, pending_payload) \
         VALUES ($1, $2, $3, $4, 'pending', 0, $5, $6) RETURNING id",
    )
    .bind(format!("pending:{}", uuid::Uuid::new_v4()))
    .bind(contract_id)
    .bind(action_type)
    .bind(serde_json::to_string(&pending_payload).unwrap_or_default())
    .bind(last_error)
    .bind(pending_payload)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

/// Fetch all pending rows ordered by id (FIFO).
pub async fn list_pending(pool: &PgPool) -> Result<Vec<PendingRow>, QueueError> {
    let rows = sqlx::query_as::<_, (i64, String, String, Value, i32, Option<String>)>(
        "SELECT id, contract_id, action_type, pending_payload, attempts, last_error \
         FROM blockchain_transactions WHERE status = 'pending' ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, contract_id, action_type, pending_payload, attempts, last_error)| PendingRow {
            id,
            contract_id,
            action_type,
            pending_payload,
            attempts,
            last_error,
        })
        .collect())
}

/// Mark a row confirmed once the retry succeeded.
pub async fn mark_confirmed(
    pool: &PgPool,
    row_id: i64,
    tx_hash: &str,
) -> Result<(), QueueError> {
    sqlx::query(
        "UPDATE blockchain_transactions SET status = 'confirmed', tx_hash = $1, last_error = NULL \
         WHERE id = $2",
    )
    .bind(tx_hash)
    .bind(row_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Increment attempts and store the latest error. After 5 attempts, status='failed'.
pub async fn mark_attempt_failed(
    pool: &PgPool,
    row_id: i64,
    error: &str,
) -> Result<(), QueueError> {
    sqlx::query(
        "UPDATE blockchain_transactions \
         SET attempts = attempts + 1, last_error = $1, \
             status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE status END, \
             next_retry_at = NOW() + INTERVAL '30 seconds' \
         WHERE id = $2",
    )
    .bind(error)
    .bind(row_id)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_summary_default_is_zeroed() {
        let s = RetrySummary::default();
        assert_eq!(s.total, 0);
        assert!(s.results.is_empty());
    }
}
