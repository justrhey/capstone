#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, BytesN, Env, Address, Vec, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct AuditEntry {
    pub user_id: BytesN<32>,
    pub record_id: BytesN<32>,
    pub action: Symbol,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    AuditLog(BytesN<32>, u64),
    RecordAuditCount(BytesN<32>),
    Owner,
}

const OWNER_KEY: Symbol = symbol_short!("OWNER");

#[contract]
pub struct AuditTrail;

#[contractimpl]
impl AuditTrail {
    pub fn init(env: Env, owner: Address) {
        env.storage().instance().set(&OWNER_KEY, &owner);
    }

    pub fn log_access(
        env: Env,
        user_id: BytesN<32>,
        record_id: BytesN<32>,
        action: Symbol,
    ) -> u64 {
        let owner: Address = env.storage().instance().get(&OWNER_KEY).unwrap();
        owner.require_auth();

        let timestamp = env.ledger().timestamp();

        let entry = AuditEntry {
            user_id,
            record_id: record_id.clone(),
            action,
            timestamp,
        };

        let count_key = DataKey::RecordAuditCount(record_id.clone());
        let count: u64 = env.storage().persistent().get(&count_key).unwrap_or(0);

        let log_key = DataKey::AuditLog(record_id.clone(), count);
        env.storage().persistent().set(&log_key, &entry);

        let new_count = count + 1;
        env.storage().persistent().set(&count_key, &new_count);

        count
    }

    pub fn get_audit_log(env: Env, record_id: BytesN<32>) -> Vec<AuditEntry> {
        let count_key = DataKey::RecordAuditCount(record_id.clone());
        let count: u64 = env.storage().persistent().get(&count_key).unwrap_or(0);

        let mut entries = Vec::new(&env);
        let mut i: u64 = 0;
        while i < count {
            let log_key = DataKey::AuditLog(record_id.clone(), i);
            let entry: Option<AuditEntry> = env.storage().persistent().get(&log_key);
            if let Some(entry) = entry {
                entries.push_back(entry);
            }
            i += 1;
        }

        entries
    }
}