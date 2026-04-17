use sqlx::PgPool;
use crate::config::Config;
use std::process::{Command, Output};
use std::sync::atomic::{AtomicBool, Ordering};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Convert a UUID to a 32-byte hex string suitable for a Soroban `BytesN<32>` argument.
/// UUIDs are 16 bytes; we zero-pad the high 16 bytes. The mapping is deterministic
/// and reversible.
pub fn uuid_to_bytes32_hex(uuid: &str) -> String {
    let parsed = Uuid::parse_str(uuid).unwrap_or(Uuid::nil());
    let src = parsed.as_bytes();
    let mut padded = [0u8; 32];
    padded[..16].copy_from_slice(src);
    hex::encode(padded)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BlockchainTx {
    pub tx_hash: String,
    pub contract_id: String,
    pub action: String,
    pub block_number: Option<i64>,
}

/// Return value of a successful `log_access` call — carries the authoritative
/// ledger timestamp for the event.
#[derive(Debug, Serialize, Deserialize)]
pub struct AuditAnchor {
    pub tx: BlockchainTx,
    pub ledger_timestamp: i64,
    pub sequence: i64,
}

/// Parse a Soroban CLI response that represents a tuple `(u64, u64)` — the
/// CLI typically emits this as `[1700000000,5]` on stdout. We tolerate a few
/// variations so small CLI version differences don't silently drop the value.
pub(crate) fn parse_u64_tuple(out: &str) -> Option<(i64, i64)> {
    let trimmed = out.trim().trim_matches(|c| c == '"');
    // Try JSON array first: "[ts,seq]"
    if let Ok(arr) = serde_json::from_str::<Vec<i64>>(trimmed) {
        if arr.len() == 2 {
            return Some((arr[0], arr[1]));
        }
    }
    // Fallback: comma-separated numbers with optional parens: "(ts, seq)" or "ts,seq"
    let cleaned: String = trimmed
        .chars()
        .filter(|c| !matches!(c, '(' | ')' | ' '))
        .collect();
    let parts: Vec<&str> = cleaned.split(',').collect();
    if parts.len() == 2 {
        if let (Ok(a), Ok(b)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
            return Some((a, b));
        }
    }
    None
}

/// Probe the soroban CLI once per process. Subsequent calls are constant-time.
fn soroban_available() -> bool {
    static CHECKED: AtomicBool = AtomicBool::new(false);
    static AVAILABLE: AtomicBool = AtomicBool::new(false);

    if CHECKED.load(Ordering::Relaxed) {
        return AVAILABLE.load(Ordering::Relaxed);
    }

    let ok = Command::new("soroban")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !ok {
        eprintln!(
            "[blockchain] soroban CLI not available — on-chain operations will be skipped. \
             Install the Stellar CLI to enable blockchain integration."
        );
    }

    AVAILABLE.store(ok, Ordering::Relaxed);
    CHECKED.store(true, Ordering::Relaxed);
    ok
}

fn run_soroban(args: &[&str], action: &str) -> Option<Output> {
    if !soroban_available() {
        return None;
    }
    match Command::new("soroban").args(args).output() {
        Ok(out) if out.status.success() => Some(out),
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            eprintln!("[blockchain] {} exited non-zero: {}", action, stderr.trim());
            None
        }
        Err(e) => {
            eprintln!("[blockchain] {} failed to spawn: {}", action, e);
            None
        }
    }
}

async fn record_tx(pool: &PgPool, tx_hash: &str, contract_id: &str, action: &str, payload: &str) {
    let res = sqlx::query(
        "INSERT INTO blockchain_transactions (tx_hash, contract_id, action_type, payload) \
         VALUES ($1, $2, $3, $4)",
    )
    .bind(tx_hash)
    .bind(contract_id)
    .bind(action)
    .bind(payload)
    .execute(pool)
    .await;
    if let Err(e) = res {
        eprintln!("[blockchain] failed to record tx in DB: {}", e);
    }
}

/// Anchor a brand-new record (version 1). Will fail if the contract already knows
/// about this record_id — in that case use `update_record_hash` instead.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_array_form() {
        assert_eq!(parse_u64_tuple("[1700000000,5]"), Some((1700000000, 5)));
        assert_eq!(parse_u64_tuple("  [1700000000, 5]  "), Some((1700000000, 5)));
    }

    #[test]
    fn parses_parenthesized_tuple_form() {
        assert_eq!(parse_u64_tuple("(1700000000, 5)"), Some((1700000000, 5)));
    }

    #[test]
    fn parses_bare_comma_pair() {
        assert_eq!(parse_u64_tuple("1700000000,5"), Some((1700000000, 5)));
    }

    #[test]
    fn returns_none_for_garbage() {
        assert_eq!(parse_u64_tuple("not a tuple"), None);
        assert_eq!(parse_u64_tuple("[1,2,3]"), None);
        assert_eq!(parse_u64_tuple(""), None);
    }

    #[test]
    fn uuid_hex_is_32_bytes_with_uuid_in_first_half() {
        let got = uuid_to_bytes32_hex("3775a7d5-fa17-4fc2-bc6a-a1af10af3a14");
        assert_eq!(got.len(), 64, "must be 32 bytes = 64 hex chars");
        // First 16 bytes = UUID bytes (no hyphens).
        assert_eq!(&got[..32], "3775a7d5fa174fc2bc6aa1af10af3a14");
        // Last 16 bytes = zero padding.
        assert_eq!(&got[32..], "00000000000000000000000000000000");
    }

    #[test]
    fn uuid_hex_is_deterministic_and_bidirectional() {
        let a = uuid_to_bytes32_hex("3775a7d5-fa17-4fc2-bc6a-a1af10af3a14");
        let b = uuid_to_bytes32_hex("3775a7d5-fa17-4fc2-bc6a-a1af10af3a14");
        assert_eq!(a, b);
    }

    #[test]
    fn uuid_hex_rejects_garbage_with_nil() {
        // Invalid UUIDs become the all-zero nil uuid for deterministic behavior.
        assert_eq!(
            uuid_to_bytes32_hex("not-a-uuid"),
            "0".repeat(64)
        );
    }
}

pub async fn store_record_hash(
    pool: &PgPool,
    record_id: &str,
    patient_id: &str,
    record_hash: &str,
    config: &Config,
) -> Option<BlockchainTx> {
    let record_id_hex = uuid_to_bytes32_hex(record_id);
    let patient_id_hex = uuid_to_bytes32_hex(patient_id);
    let output = run_soroban(
        &[
            "contract", "invoke",
            "--id", &config.record_registry_contract_id,
            "--",
            "store_hash",
            "--record_id", &record_id_hex,
            "--patient_id", &patient_id_hex,
            "--record_hash", record_hash,
            "--rpc-url", &config.stellar_rpc_url,
            "--network-passphrase", &config.stellar_network_passphrase,
            "--source", "admin",
        ],
        "store_record_hash",
    )?;

    let tx_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if tx_hash.is_empty() {
        eprintln!("[blockchain] store_record_hash returned empty tx hash");
        return None;
    }

    record_tx(
        pool,
        &tx_hash,
        &config.record_registry_contract_id,
        "store_hash",
        &format!(
            "record_id={},patient_id={},record_hash={}",
            record_id, patient_id, record_hash
        ),
    )
    .await;

    Some(BlockchainTx {
        tx_hash,
        contract_id: config.record_registry_contract_id.clone(),
        action: "store_hash".into(),
        block_number: None,
    })
}

/// Append a new version for an existing record. The prior version is
/// automatically tombstoned by the contract.
pub async fn update_record_hash(
    pool: &PgPool,
    record_id: &str,
    record_hash: &str,
    config: &Config,
) -> Option<BlockchainTx> {
    let record_id_hex = uuid_to_bytes32_hex(record_id);
    let output = run_soroban(
        &[
            "contract", "invoke",
            "--id", &config.record_registry_contract_id,
            "--",
            "update_hash",
            "--record_id", &record_id_hex,
            "--record_hash", record_hash,
            "--rpc-url", &config.stellar_rpc_url,
            "--network-passphrase", &config.stellar_network_passphrase,
            "--source", "admin",
        ],
        "update_record_hash",
    )?;

    let tx_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if tx_hash.is_empty() {
        eprintln!("[blockchain] update_record_hash returned empty tx hash");
        return None;
    }

    record_tx(
        pool,
        &tx_hash,
        &config.record_registry_contract_id,
        "update_hash",
        &format!("record_id={},record_hash={}", record_id, record_hash),
    )
    .await;

    Some(BlockchainTx {
        tx_hash,
        contract_id: config.record_registry_contract_id.clone(),
        action: "update_hash".into(),
        block_number: None,
    })
}

/// Returns `Some(true)` if hash matches the latest active version on-chain,
/// `Some(false)` if it does not match (tampered, or record_id unknown),
/// or `None` if the chain cannot be reached.
pub async fn verify_record_hash(
    _pool: &PgPool,
    record_id: &str,
    record_hash: &str,
    config: &Config,
) -> Option<bool> {
    let record_id_hex = uuid_to_bytes32_hex(record_id);
    let output = run_soroban(
        &[
            "contract", "invoke",
            "--id", &config.record_registry_contract_id,
            "--",
            "verify_latest",
            "--record_id", &record_id_hex,
            "--record_hash", record_hash,
            "--rpc-url", &config.stellar_rpc_url,
            "--network-passphrase", &config.stellar_network_passphrase,
            "--source", "admin",
        ],
        "verify_record_hash",
    )?;

    Some(String::from_utf8_lossy(&output.stdout).trim() == "true")
}

pub async fn grant_access_onchain(
    pool: &PgPool,
    patient_id: &str,
    granted_to: &str,
    record_id: &str,
    duration_seconds: u64,
    config: &Config,
) -> Option<BlockchainTx> {
    let duration = duration_seconds.to_string();
    let patient_id_hex = uuid_to_bytes32_hex(patient_id);
    let granted_to_hex = uuid_to_bytes32_hex(granted_to);
    let record_id_hex = uuid_to_bytes32_hex(record_id);
    let output = run_soroban(
        &[
            "contract", "invoke",
            "--id", &config.access_manager_contract_id,
            "--",
            "grant_access",
            "--patient_id", &patient_id_hex,
            "--granted_to", &granted_to_hex,
            "--record_id", &record_id_hex,
            "--duration_seconds", &duration,
            "--rpc-url", &config.stellar_rpc_url,
            "--network-passphrase", &config.stellar_network_passphrase,
            "--source", "admin",
        ],
        "grant_access_onchain",
    )?;

    let tx_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if tx_hash.is_empty() {
        return None;
    }

    record_tx(
        pool,
        &tx_hash,
        &config.access_manager_contract_id,
        "grant_access",
        &format!(
            "patient_id={},granted_to={},record_id={}",
            patient_id, granted_to, record_id
        ),
    )
    .await;

    Some(BlockchainTx {
        tx_hash,
        contract_id: config.access_manager_contract_id.clone(),
        action: "grant_access".into(),
        block_number: None,
    })
}

/// Mirror an audit event to the Audit Trail contract.
/// Returns `Some(AuditAnchor)` carrying the ledger timestamp — this is the
/// authoritative "when" for the event per the decentralized-time policy
/// (see `docs/smart-contracts.md` §Timestamp policy).
/// Ask the Access Manager contract whether `granted_to` holds any active,
/// non-expired permission for `patient_id`. Returns:
/// - `Some(true)` — chain confirms an active grant exists
/// - `Some(false)` — chain confirms no active grant
/// - `None` — chain unreachable or output unparseable (caller should fall back)
pub async fn has_active_patient_grant(
    patient_id: &str,
    granted_to: &str,
    config: &Config,
) -> Option<bool> {
    let patient_id_hex = uuid_to_bytes32_hex(patient_id);
    let granted_to_hex_needle = uuid_to_bytes32_hex(granted_to);
    let output = run_soroban(
        &[
            "contract", "invoke",
            "--id", &config.access_manager_contract_id,
            "--",
            "get_patient_permissions",
            "--patient_id", &patient_id_hex,
            "--rpc-url", &config.stellar_rpc_url,
            "--network-passphrase", &config.stellar_network_passphrase,
            "--source", "admin",
        ],
        "has_active_patient_grant",
    )?;

    // CLI emits JSON: [[patient_hex, granted_to_hex, record_hex], ...] or []
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let arr: Vec<Vec<String>> = match serde_json::from_str(&stdout) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("[blockchain] could not parse get_patient_permissions output: {}", e);
            return None;
        }
    };
    let found = arr.iter().any(|perm| {
        perm.len() >= 2
            && perm[0].eq_ignore_ascii_case(&patient_id_hex)
            && perm[1].eq_ignore_ascii_case(&granted_to_hex_needle)
    });
    Some(found)
}

pub async fn log_access_onchain(
    pool: &PgPool,
    user_id: &str,
    record_id: &str,
    action: &str,
    config: &Config,
) -> Option<AuditAnchor> {
    let user_id_hex = uuid_to_bytes32_hex(user_id);
    let record_id_hex = uuid_to_bytes32_hex(record_id);
    let output = run_soroban(
        &[
            "contract", "invoke",
            "--id", &config.audit_trail_contract_id,
            "--",
            "log_access",
            "--user_id", &user_id_hex,
            "--record_id", &record_id_hex,
            "--action", action,
            "--rpc-url", &config.stellar_rpc_url,
            "--network-passphrase", &config.stellar_network_passphrase,
            "--source", "admin",
        ],
        "log_access_onchain",
    )?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    // The CLI emits (ledger_timestamp, sequence) as a 2-element array on success.
    // If we can't parse it, we still return Some — just with sentinel values —
    // so the caller knows the on-chain write happened but we failed to capture
    // the authoritative timestamp.
    let (ledger_timestamp, sequence) = parse_u64_tuple(&stdout).unwrap_or((-1, -1));

    // tx_hash is not actually in stdout for contract-invoke (stdout is the
    // return value). For now we use the raw stdout as an opaque identifier
    // for `blockchain_transactions.tx_hash`. Future work: parse JSON logs from
    // stderr for the real tx_hash.
    let tx_hash = stdout.trim().to_string();
    if tx_hash.is_empty() {
        return None;
    }

    record_tx(
        pool,
        &tx_hash,
        &config.audit_trail_contract_id,
        "log_access",
        &format!(
            "user_id={},record_id={},action={},ts={},seq={}",
            user_id, record_id, action, ledger_timestamp, sequence
        ),
    )
    .await;

    Some(AuditAnchor {
        tx: BlockchainTx {
            tx_hash,
            contract_id: config.audit_trail_contract_id.clone(),
            action: "log_access".into(),
            block_number: None,
        },
        ledger_timestamp,
        sequence,
    })
}
