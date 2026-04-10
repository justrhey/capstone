
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, BytesN, Env, Symbol, Vec, Address};

#[contracttype]
#[derive(Clone)]
pub struct RecordHash {
    pub patient_id: BytesN<32>,
    pub record_hash: BytesN<32>,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Record(BytesN<32>),
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

    pub fn store_hash(env: Env, patient_id: BytesN<32>, record_hash: BytesN<32>) -> u64 {
        let owner: Address = env.storage().instance().get(&OWNER_KEY).unwrap();
        owner.require_auth();

        let timestamp = env.ledger().timestamp();

        let record = RecordHash {
            patient_id: patient_id.clone(),
            record_hash: record_hash.clone(),
            timestamp,
        };

        let key = DataKey::Record(record_hash.clone());
        env.storage().persistent().set(&key, &record);

        let mut records: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::PatientRecords(patient_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        records.push_back(record_hash);
        env.storage()
            .persistent()
            .set(&DataKey::PatientRecords(patient_id), &records);

        timestamp
    }

    pub fn verify_hash(env: Env, record_hash: BytesN<32>) -> bool {
        let key = DataKey::Record(record_hash);
        env.storage().persistent().has(&key)
    }

    pub fn get_patient_records(env: Env, patient_id: BytesN<32>) -> Vec<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::PatientRecords(patient_id))
            .unwrap_or_else(|| Vec::new(&env))
    }
}