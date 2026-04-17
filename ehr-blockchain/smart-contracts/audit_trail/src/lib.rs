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

    /// Returns `(ledger_timestamp, sequence)` — the ledger-level timestamp for
    /// this event and the per-record sequence number. Clients should treat the
    /// ledger timestamp as the authoritative time of the audit event; the
    /// backend's DB `created_at` is advisory-only when the on-chain mirror
    /// succeeds.
    pub fn log_access(
        env: Env,
        user_id: BytesN<32>,
        record_id: BytesN<32>,
        action: Symbol,
    ) -> (u64, u64) {
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

        (timestamp, count)
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

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, BytesN, Env, Symbol};

    fn setup() -> (
        Env,
        AuditTrailClient<'static>,
        BytesN<32>,
        BytesN<32>,
        Symbol,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let contract_id = env.register_contract(None, AuditTrail);
        let client = AuditTrailClient::new(&env, &contract_id);
        client.init(&owner);
        let user = BytesN::from_array(&env, &[1u8; 32]);
        let record = BytesN::from_array(&env, &[2u8; 32]);
        let action = Symbol::new(&env, "read");
        (env, client, user, record, action)
    }

    #[test]
    fn log_access_returns_ledger_timestamp_and_sequence() {
        let (env, client, user, record, action) = setup();
        let (ts1, seq1) = client.log_access(&user, &record, &action);
        let (ts2, seq2) = client.log_access(&user, &record, &action);

        assert_eq!(seq1, 0);
        assert_eq!(seq2, 1);
        // Ledger timestamp is monotonic non-decreasing — either equal if same ledger or increasing.
        assert!(ts2 >= ts1, "ledger timestamps must be monotonic");
        // And it must match the env's current ledger timestamp (authoritative).
        assert_eq!(ts2, env.ledger().timestamp());
    }

    #[test]
    fn get_audit_log_preserves_timestamps() {
        let (env, client, user, record, action) = setup();
        let (ts1, _) = client.log_access(&user, &record, &action);
        let (ts2, _) = client.log_access(&user, &record, &action);

        let entries = client.get_audit_log(&record);
        assert_eq!(entries.len(), 2);
        // Stored entry timestamps equal what log_access returned, confirming the contract
        // persists the *ledger* timestamp rather than some derived value.
        assert_eq!(entries.get(0).unwrap().timestamp, ts1);
        assert_eq!(entries.get(1).unwrap().timestamp, ts2);
        // And both match the test env's current ledger timestamp.
        assert_eq!(ts2, env.ledger().timestamp());
    }
}