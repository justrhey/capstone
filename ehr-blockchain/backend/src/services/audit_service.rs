use actix_web::HttpRequest;
use chrono::{DateTime, TimeZone, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::services::blockchain_service::log_access_onchain;

fn client_ip(req: &HttpRequest) -> Option<String> {
    req.connection_info()
        .realip_remote_addr()
        .map(|s| s.to_string())
}

/// Authoritative timestamp for an audit event.
///
/// Policy: when the on-chain mirror succeeds, the Stellar ledger timestamp
/// wins — it is externally attested and cannot be backdated by a compromised
/// backend. When the chain is unreachable, the DB `created_at` is used as a
/// best-available stamp, and the event is flagged as "db-only" in reports.
pub fn authoritative_timestamp(
    db_created_at: DateTime<Utc>,
    blockchain_timestamp: Option<i64>,
) -> DateTime<Utc> {
    match blockchain_timestamp {
        Some(ts) if ts > 0 => Utc.timestamp_opt(ts, 0).single().unwrap_or(db_created_at),
        _ => db_created_at,
    }
}

/// Best-effort audit log write. Errors are swallowed so that audit
/// failures never break the primary operation. When the event concerns a
/// medical record and the on-chain mirror succeeds, the ledger timestamp
/// and sequence are captured into the same row (see `docs/smart-contracts.md`
/// §Timestamp policy).
pub async fn log_action(
    pool: &PgPool,
    user_id: Uuid,
    action: &str,
    resource_type: Option<&str>,
    resource_id: Option<Uuid>,
    req: &HttpRequest,
) {
    let ip = client_ip(req);
    let row_id_result: Result<Uuid, sqlx::Error> = sqlx::query_scalar(
        "INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address) \
         VALUES ($1, $2, $3, $4, $5) RETURNING id",
    )
    .bind(user_id)
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(&ip)
    .fetch_one(pool)
    .await;

    let Ok(row_id) = row_id_result else {
        if let Err(e) = row_id_result {
            eprintln!("[audit] failed to write audit log for action={}: {}", action, e);
        }
        return;
    };

    // Rule-engine hook: count audited actions per user; emit an incident if
    // the rate crosses the mass-read threshold.
    crate::services::incident_service::on_audit_write(pool, user_id, ip.as_deref()).await;

    // Mirror record-scoped events to the on-chain audit trail. Silent on failure.
    if resource_type == Some("medical_record") {
        if let (Some(record_id), Ok(config)) = (resource_id, Config::from_env()) {
            if let Some(anchor) = log_access_onchain(
                pool,
                &user_id.to_string(),
                &record_id.to_string(),
                action,
                &config,
            )
            .await
            {
                let update = sqlx::query(
                    "UPDATE audit_logs SET blockchain_timestamp = $1, blockchain_sequence = $2 \
                     WHERE id = $3",
                )
                .bind(anchor.ledger_timestamp)
                .bind(anchor.sequence)
                .bind(row_id)
                .execute(pool)
                .await;
                if let Err(e) = update {
                    eprintln!("[audit] failed to persist ledger timestamp: {}", e);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authoritative_picks_ledger_when_available() {
        let db = Utc.with_ymd_and_hms(2026, 4, 1, 12, 0, 0).unwrap();
        let chain = Utc.with_ymd_and_hms(2026, 4, 1, 12, 0, 5).unwrap().timestamp();
        let got = authoritative_timestamp(db, Some(chain));
        assert_eq!(got.timestamp(), chain);
    }

    #[test]
    fn authoritative_falls_back_to_db_when_chain_missing() {
        let db = Utc.with_ymd_and_hms(2026, 4, 1, 12, 0, 0).unwrap();
        assert_eq!(authoritative_timestamp(db, None), db);
    }

    #[test]
    fn authoritative_falls_back_on_sentinel_negative() {
        let db = Utc.with_ymd_and_hms(2026, 4, 1, 12, 0, 0).unwrap();
        assert_eq!(authoritative_timestamp(db, Some(-1)), db);
    }

    #[test]
    fn ledger_wins_even_when_it_differs_significantly_from_db() {
        // Ledger clock could be ahead or behind. Policy: trust the ledger.
        let db = Utc.with_ymd_and_hms(2026, 4, 1, 12, 0, 0).unwrap();
        let way_earlier = Utc.with_ymd_and_hms(2025, 1, 1, 0, 0, 0).unwrap().timestamp();
        let got = authoritative_timestamp(db, Some(way_earlier));
        assert_eq!(got.timestamp(), way_earlier);
        assert_ne!(got, db);
    }
}
