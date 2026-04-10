use std::env;

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
            database_url: env::var("DATABASE_URL")?,
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
        })
    }
}