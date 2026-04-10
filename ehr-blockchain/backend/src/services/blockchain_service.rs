use sqlx::PgPool;
use crate::services::auth_service::AppError;
use crate::config::Config;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct BlockchainTx {
    pub tx_hash: String,
    pub contract_id: String,
    pub action: String,
    pub block_number: Option<i64>,
}

pub async fn store_record_hash(
    pool: &PgPool,
    patient_id: &str,
    record_hash: &str,
    config: &Config,
) -> Result<BlockchainTx, AppError> {
    let output = Command::new("soroban")
        .args(&[
            "contract", "invoke",
            "--id", &config.record_registry_contract_id,
            "--",
            "store_hash",
            "--patient_id", patient_id,
            "--record_hash", record_hash,
            "--network", "local",
            "--source", "admin",
        ])
        .output()
        .map_err(|e| AppError::InternalError(format!("Failed to invoke contract: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let tx_hash = stdout.trim().to_string();

    sqlx::query(
        "INSERT INTO blockchain_transactions (tx_hash, contract_id, action_type, payload) VALUES ($1, $2, $3, $4)"
    )
        .bind(&tx_hash)
        .bind(&config.record_registry_contract_id)
        .bind("store_hash")
        .bind(format!("patient_id={},record_hash={}", patient_id, record_hash))
        .execute(pool)
        .await?;

    Ok(BlockchainTx {
        tx_hash,
        contract_id: config.record_registry_contract_id.clone(),
        action: "store_hash".into(),
        block_number: None,
    })
}

pub async fn verify_record_hash(
    pool: &PgPool,
    record_hash: &str,
    config: &Config,
) -> Result<bool, AppError> {
    let output = Command::new("soroban")
        .args(&[
            "contract", "invoke",
            "--id", &config.record_registry_contract_id,
            "--",
            "verify_hash",
            "--record_hash", record_hash,
            "--network", "local",
            "--source", "admin",
        ])
        .output()
        .map_err(|e| AppError::InternalError(format!("Failed to invoke contract: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim() == "true")
}

pub async fn grant_access_onchain(
    pool: &PgPool,
    patient_id: &str,
    granted_to: &str,
    record_id: &str,
    duration_seconds: u64,
    config: &Config,
) -> Result<BlockchainTx, AppError> {
    let output = Command::new("soroban")
        .args(&[
            "contract", "invoke",
            "--id", &config.access_manager_contract_id,
            "--",
            "grant_access",
            "--patient_id", patient_id,
            "--granted_to", granted_to,
            "--record_id", record_id,
            "--duration_seconds", &duration_seconds.to_string(),
            "--network", "local",
            "--source", "admin",
        ])
        .output()
        .map_err(|e| AppError::InternalError(format!("Failed to invoke contract: {}", e)))?;

    let tx_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();

    sqlx::query(
        "INSERT INTO blockchain_transactions (tx_hash, contract_id, action_type, payload) VALUES ($1, $2, $3, $4)"
    )
        .bind(&tx_hash)
        .bind(&config.access_manager_contract_id)
        .bind("grant_access")
        .bind(format!("patient_id={},granted_to={},record_id={}", patient_id, granted_to, record_id))
        .execute(pool)
        .await?;

    Ok(BlockchainTx {
        tx_hash,
        contract_id: config.access_manager_contract_id.clone(),
        action: "grant_access".into(),
        block_number: None,
    })
}

pub async fn log_access_onchain(
    pool: &PgPool,
    user_id: &str,
    record_id: &str,
    action: &str,
    config: &Config,
) -> Result<BlockchainTx, AppError> {
    let output = Command::new("soroban")
        .args(&[
            "contract", "invoke",
            "--id", &config.audit_trail_contract_id,
            "--",
            "log_access",
            "--user_id", user_id,
            "--record_id", record_id,
            "--action", action,
            "--network", "local",
            "--source", "admin",
        ])
        .output()
        .map_err(|e| AppError::InternalError(format!("Failed to invoke contract: {}", e)))?;

    let tx_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();

    sqlx::query(
        "INSERT INTO blockchain_transactions (tx_hash, contract_id, action_type, payload) VALUES ($1, $2, $3, $4)"
    )
        .bind(&tx_hash)
        .bind(&config.audit_trail_contract_id)
        .bind("log_access")
        .bind(format!("user_id={},record_id={},action={}", user_id, record_id, action))
        .execute(pool)
        .await?;

    Ok(BlockchainTx {
        tx_hash,
        contract_id: config.audit_trail_contract_id.clone(),
        action: "log_access".into(),
        block_number: None,
    })
}