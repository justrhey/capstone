#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol, Vec};

/// On-chain lifecycle state of a specific (record_id, version) tuple.
/// When a record is updated, the prior version is tombstoned with a pointer to
/// the version that replaced it — creating an auditable chain from v1 → v2 → v3.
#[contracttype]
#[derive(Clone)]
pub enum RecordState {
    Active,
    /// Replaced by the referenced version. The prior record_hash remains
    /// retrievable; clients can walk the chain of updates.
    Tombstoned(u32),
}

#[contracttype]
#[derive(Clone)]
pub struct RecordVersion {
    pub record_id: BytesN<32>,
    pub patient_id: BytesN<32>,
    pub version: u32,
    pub record_hash: BytesN<32>,
    pub timestamp: u64,
    pub state: RecordState,
}

#[contracttype]
pub enum DataKey {
    /// (record_id, version) -> RecordVersion
    Version(BytesN<32>, u32),
    /// record_id -> latest version number
    LatestVersion(BytesN<32>),
    /// patient_id -> Vec<record_id>
    PatientRecords(BytesN<32>),
    Owner,
}

const OWNER_KEY: Symbol = symbol_short!("OWNER");

#[contract]
pub struct RecordRegistry;

#[contractimpl]
impl RecordRegistry {
    pub fn init(env: Env, owner: Address) {
        env.storage().instance().set(&OWNER_KEY, &owner);
    }

    /// Anchor a brand-new record at version 1. Panics if the record_id already
    /// exists — updates must go through `update_hash`. This is what prevents the
    /// "rogue admin overwrites the hash" attack we had in the v1 contract.
    pub fn store_hash(
        env: Env,
        record_id: BytesN<32>,
        patient_id: BytesN<32>,
        record_hash: BytesN<32>,
    ) -> u32 {
        let owner: Address = env.storage().instance().get(&OWNER_KEY).unwrap();
        owner.require_auth();

        if env
            .storage()
            .persistent()
            .has(&DataKey::LatestVersion(record_id.clone()))
        {
            panic!("record_id already exists; use update_hash");
        }

        let version: u32 = 1;
        let entry = RecordVersion {
            record_id: record_id.clone(),
            patient_id: patient_id.clone(),
            version,
            record_hash,
            timestamp: env.ledger().timestamp(),
            state: RecordState::Active,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Version(record_id.clone(), version), &entry);
        env.storage()
            .persistent()
            .set(&DataKey::LatestVersion(record_id.clone()), &version);

        let mut records: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::PatientRecords(patient_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        records.push_back(record_id);
        env.storage()
            .persistent()
            .set(&DataKey::PatientRecords(patient_id), &records);

        version
    }

    /// Append a new version for an existing record. Tombstones the prior
    /// version with a pointer to the new one. Panics if the record doesn't exist.
    pub fn update_hash(
        env: Env,
        record_id: BytesN<32>,
        record_hash: BytesN<32>,
    ) -> u32 {
        let owner: Address = env.storage().instance().get(&OWNER_KEY).unwrap();
        owner.require_auth();

        let latest: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::LatestVersion(record_id.clone()))
            .unwrap_or_else(|| panic!("record_id not found; use store_hash first"));

        let new_version: u32 = latest + 1;

        let prior_key = DataKey::Version(record_id.clone(), latest);
        let mut prior: RecordVersion = env
            .storage()
            .persistent()
            .get(&prior_key)
            .expect("latest version exists but its entry is missing — state corruption");

        // Idempotency guard: if someone retries with the same hash, don't churn.
        if matches!(prior.state, RecordState::Active) && prior.record_hash == record_hash {
            return latest;
        }

        // Tombstone the prior version.
        prior.state = RecordState::Tombstoned(new_version);
        env.storage().persistent().set(&prior_key, &prior);

        // Write the new active version.
        let entry = RecordVersion {
            record_id: record_id.clone(),
            patient_id: prior.patient_id,
            version: new_version,
            record_hash,
            timestamp: env.ledger().timestamp(),
            state: RecordState::Active,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Version(record_id.clone(), new_version), &entry);
        env.storage()
            .persistent()
            .set(&DataKey::LatestVersion(record_id), &new_version);

        new_version
    }

    /// True if `record_hash` matches the current Active version of `record_id`.
    pub fn verify_latest(env: Env, record_id: BytesN<32>, record_hash: BytesN<32>) -> bool {
        let Some(latest): Option<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::LatestVersion(record_id.clone()))
        else {
            return false;
        };
        let Some(entry): Option<RecordVersion> = env
            .storage()
            .persistent()
            .get(&DataKey::Version(record_id, latest))
        else {
            return false;
        };
        matches!(entry.state, RecordState::Active) && entry.record_hash == record_hash
    }

    pub fn get_latest_version(env: Env, record_id: BytesN<32>) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::LatestVersion(record_id))
            .unwrap_or(0)
    }

    pub fn get_version(env: Env, record_id: BytesN<32>, version: u32) -> Option<RecordVersion> {
        env.storage()
            .persistent()
            .get(&DataKey::Version(record_id, version))
    }

    pub fn get_versions(env: Env, record_id: BytesN<32>) -> Vec<RecordVersion> {
        let mut out: Vec<RecordVersion> = Vec::new(&env);
        let Some(latest): Option<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::LatestVersion(record_id.clone()))
        else {
            return out;
        };
        let mut v: u32 = 1;
        while v <= latest {
            if let Some(entry) = env
                .storage()
                .persistent()
                .get::<_, RecordVersion>(&DataKey::Version(record_id.clone(), v))
            {
                out.push_back(entry);
            }
            v += 1;
        }
        out
    }

    pub fn get_patient_records(env: Env, patient_id: BytesN<32>) -> Vec<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::PatientRecords(patient_id))
            .unwrap_or_else(|| Vec::new(&env))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, BytesN, Env};

    fn setup() -> (
        Env,
        Address,
        RecordRegistryClient<'static>,
        BytesN<32>,
        BytesN<32>,
        BytesN<32>,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let contract_id = env.register_contract(None, RecordRegistry);
        let client = RecordRegistryClient::new(&env, &contract_id);
        client.init(&owner);
        let record_id = BytesN::from_array(&env, &[1u8; 32]);
        let patient_id = BytesN::from_array(&env, &[2u8; 32]);
        let hash = BytesN::from_array(&env, &[3u8; 32]);
        (env, owner, client, record_id, patient_id, hash)
    }

    #[test]
    fn store_hash_creates_version_1() {
        let (_, _, client, record_id, patient_id, hash) = setup();
        let v = client.store_hash(&record_id, &patient_id, &hash);
        assert_eq!(v, 1);
        assert_eq!(client.get_latest_version(&record_id), 1);
        assert!(client.verify_latest(&record_id, &hash));
    }

    #[test]
    #[should_panic(expected = "already exists")]
    fn store_hash_rejects_duplicate_record_id() {
        let (_, _, client, record_id, patient_id, hash) = setup();
        client.store_hash(&record_id, &patient_id, &hash);
        client.store_hash(&record_id, &patient_id, &hash);
    }

    #[test]
    fn update_hash_tombstones_prior_and_increments_version() {
        let (env, _, client, record_id, patient_id, hash) = setup();
        client.store_hash(&record_id, &patient_id, &hash);

        let new_hash = BytesN::from_array(&env, &[4u8; 32]);
        let v = client.update_hash(&record_id, &new_hash);
        assert_eq!(v, 2);
        assert_eq!(client.get_latest_version(&record_id), 2);

        let prior = client.get_version(&record_id, &1).unwrap();
        match prior.state {
            RecordState::Tombstoned(replaced_by) => assert_eq!(replaced_by, 2),
            _ => panic!("expected Tombstoned(2)"),
        }

        assert!(client.verify_latest(&record_id, &new_hash));
        assert!(!client.verify_latest(&record_id, &hash), "old hash must not verify against latest");
    }

    #[test]
    fn update_hash_is_idempotent_for_same_hash() {
        let (_, _, client, record_id, patient_id, hash) = setup();
        client.store_hash(&record_id, &patient_id, &hash);
        // Re-calling with the same hash should be a no-op, not a churn that creates v2.
        let v = client.update_hash(&record_id, &hash);
        assert_eq!(v, 1);
        assert_eq!(client.get_latest_version(&record_id), 1);
    }

    #[test]
    #[should_panic(expected = "not found")]
    fn update_hash_panics_without_store_first() {
        let (env, _, client, record_id, _, _) = setup();
        let h = BytesN::from_array(&env, &[9u8; 32]);
        client.update_hash(&record_id, &h);
    }

    #[test]
    fn get_versions_returns_full_history() {
        let (env, _, client, record_id, patient_id, hash) = setup();
        client.store_hash(&record_id, &patient_id, &hash);
        let h2 = BytesN::from_array(&env, &[4u8; 32]);
        let h3 = BytesN::from_array(&env, &[5u8; 32]);
        client.update_hash(&record_id, &h2);
        client.update_hash(&record_id, &h3);

        let versions = client.get_versions(&record_id);
        assert_eq!(versions.len(), 3);
        let v1 = versions.get(0).unwrap();
        let v2 = versions.get(1).unwrap();
        let v3 = versions.get(2).unwrap();
        assert_eq!(v1.version, 1);
        assert_eq!(v2.version, 2);
        assert_eq!(v3.version, 3);
        assert!(matches!(v1.state, RecordState::Tombstoned(2)));
        assert!(matches!(v2.state, RecordState::Tombstoned(3)));
        assert!(matches!(v3.state, RecordState::Active));
    }

    #[test]
    fn get_patient_records_lists_all_anchored_for_patient() {
        let (env, _, client, record_id, patient_id, hash) = setup();
        client.store_hash(&record_id, &patient_id, &hash);

        let another = BytesN::from_array(&env, &[7u8; 32]);
        client.store_hash(&another, &patient_id, &BytesN::from_array(&env, &[8u8; 32]));

        let records = client.get_patient_records(&patient_id);
        assert_eq!(records.len(), 2);
    }
}
