#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, BytesN, Env, Address, Vec, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct Permission {
    pub patient_id: BytesN<32>,
    pub granted_to: BytesN<32>,
    pub record_id: BytesN<32>,
    pub granted_at: u64,
    pub expires_at: u64,
    pub active: bool,
}

#[contracttype]
pub enum DataKey {
    Permission(BytesN<32>, BytesN<32>, BytesN<32>),
    PatientPermissions(BytesN<32>),
    Owner,
}

const OWNER_KEY: Symbol = symbol_short!("OWNER");

#[contract]
pub struct AccessManager;

#[contractimpl]
impl AccessManager {
    pub fn init(env: Env, owner: Address) {
        env.storage().instance().set(&OWNER_KEY, &owner);
    }

    pub fn grant_access(
        env: Env,
        patient_id: BytesN<32>,
        granted_to: BytesN<32>,
        record_id: BytesN<32>,
        duration_seconds: u64,
    ) {
        let owner: Address = env.storage().instance().get(&OWNER_KEY).unwrap();
        owner.require_auth();

        let timestamp = env.ledger().timestamp();
        let expires_at = timestamp + duration_seconds;

        let permission = Permission {
            patient_id: patient_id.clone(),
            granted_to: granted_to.clone(),
            record_id: record_id.clone(),
            granted_at: timestamp,
            expires_at,
            active: true,
        };

        let key = DataKey::Permission(patient_id.clone(), granted_to.clone(), record_id.clone());
        env.storage().persistent().set(&key, &permission);

        let mut perms: Vec<(BytesN<32>, BytesN<32>, BytesN<32>)> = env
            .storage()
            .persistent()
            .get(&DataKey::PatientPermissions(patient_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        perms.push_back((patient_id, granted_to, record_id));
    }

    pub fn revoke_access(
        env: Env,
        patient_id: BytesN<32>,
        granted_to: BytesN<32>,
        record_id: BytesN<32>,
    ) {
        let owner: Address = env.storage().instance().get(&OWNER_KEY).unwrap();
        owner.require_auth();

        let key = DataKey::Permission(patient_id.clone(), granted_to.clone(), record_id.clone());

        let perm: Option<Permission> = env.storage().persistent().get(&key);
        if let Some(mut perm) = perm {
            perm.active = false;
            env.storage().persistent().set(&key, &perm);
        }
    }

    pub fn check_access(
        env: Env,
        patient_id: BytesN<32>,
        granted_to: BytesN<32>,
        record_id: BytesN<32>,
    ) -> bool {
        let key = DataKey::Permission(patient_id, granted_to, record_id);

        let perm: Option<Permission> = env.storage().persistent().get(&key);
        if let Some(perm) = perm {
            let now = env.ledger().timestamp();
            perm.active && now <= perm.expires_at
        } else {
            false
        }
    }

    pub fn get_patient_permissions(
        env: Env,
        patient_id: BytesN<32>,
    ) -> Vec<(BytesN<32>, BytesN<32>, BytesN<32>)> {
        env.storage()
            .persistent()
            .get(&DataKey::PatientPermissions(patient_id))
            .unwrap_or_else(|| Vec::new(&env))
    }
}