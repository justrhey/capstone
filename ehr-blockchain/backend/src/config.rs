use std::env;

#[derive(Clone)]
pub struct Config {
    pub server_host: String,
    pub server_port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expiration_minutes: i64,
    pub encryption_key: String,
    pub record_registry_contract_id: String,
    pub access_manager_contract_id: String,
    pub audit_trail_contract_id: String,
    pub stellar_rpc_url: String,
    pub stellar_network_passphrase: String,
    pub stellar_admin_key: String,
}

/// Resolve the Stellar admin secret key with the following precedence:
///
/// 1. `STELLAR_ADMIN_KEY_FILE` — path to a file (OS-permission-restricted)
///    whose contents are the secret. Preferred for production; the file can
///    live in a secrets-manager-backed mount and never touch environment or
///    shell history.
/// 2. `STELLAR_ADMIN_KEY` — inline value in `.env`. Acceptable for local dev
///    only; we log a warning when this path is taken so the operator notices.
/// 3. Placeholder string if neither is set. Blockchain writes will still work
///    in silent-fallback mode (see `services/blockchain_service.rs`).
fn load_stellar_admin_key() -> String {
    if let Ok(path) = env::var("STELLAR_ADMIN_KEY_FILE") {
        match std::fs::read_to_string(&path) {
            Ok(contents) => {
                let s = contents.trim().to_string();
                if s.is_empty() {
                    eprintln!("[config] STELLAR_ADMIN_KEY_FILE={} is empty", path);
                    return "placeholder".into();
                }
                return s;
            }
            Err(e) => {
                eprintln!("[config] could not read STELLAR_ADMIN_KEY_FILE={}: {}", path, e);
                return "placeholder".into();
            }
        }
    }
    if let Ok(v) = env::var("STELLAR_ADMIN_KEY") {
        eprintln!(
            "[config] STELLAR_ADMIN_KEY loaded inline from environment — acceptable for dev only. \
             Set STELLAR_ADMIN_KEY_FILE to a secured file path for production."
        );
        return v;
    }
    "placeholder".into()
}

impl Config {
    pub fn from_env() -> Result<Self, env::VarError> {
        dotenvy::dotenv().ok();

        Ok(Self {
            server_host: env::var("SERVER_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            server_port: env::var("SERVER_PORT")
                .unwrap_or_else(|_| "8080".into())
                .parse()
                .unwrap_or(8080),
            database_url: env::var("DATABASE_URL").unwrap_or_else(|_| "not_configured".into()),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret".into()),
            jwt_expiration_minutes: env::var("JWT_EXPIRATION_MINUTES")
                .unwrap_or_else(|_| "15".into())
                .parse()
                .unwrap_or(15),
            encryption_key: env::var("ENCRYPTION_KEY").unwrap_or_else(|_| "default-key".into()),
            record_registry_contract_id: env::var("RECORD_REGISTRY_CONTRACT_ID")
                .unwrap_or_else(|_| "placeholder".into()),
            access_manager_contract_id: env::var("ACCESS_MANAGER_CONTRACT_ID")
                .unwrap_or_else(|_| "placeholder".into()),
            audit_trail_contract_id: env::var("AUDIT_TRAIL_CONTRACT_ID")
                .unwrap_or_else(|_| "placeholder".into()),
            stellar_rpc_url: env::var("STELLAR_RPC_URL")
                .unwrap_or_else(|_| "https://soroban-testnet.stellar.org".into()),
            stellar_network_passphrase: env::var("STELLAR_NETWORK_PASSPHRASE")
                .unwrap_or_else(|_| "Test SDF Network ; September 2015".into()),
            stellar_admin_key: load_stellar_admin_key(),
        })
    }
}
