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

        // BI-2 fix: previously the pushed value was dropped because the Vec was never
        // written back. get_patient_permissions therefore always returned an empty list.
        perms.push_back((patient_id.clone(), granted_to, record_id));
        env.storage()
            .persistent()
            .set(&DataKey::PatientPermissions(patient_id), &perms);
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

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, BytesN};

    fn setup() -> (Env, Address, BytesN<32>, BytesN<32>, BytesN<32>) {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let patient = BytesN::from_array(&env, &[1u8; 32]);
        let staff = BytesN::from_array(&env, &[2u8; 32]);
        let record = BytesN::from_array(&env, &[3u8; 32]);
        (env, owner, patient, staff, record)
    }

    /// BI-2: grant_access must persist the PatientPermissions vector, otherwise
    /// get_patient_permissions silently returns an empty list.
    #[test]
    fn grant_access_persists_patient_permissions_vector() {
        let (env, owner, patient, staff, record) = setup();
        let id = env.register_contract(None, AccessManager);
        let client = AccessManagerClient::new(&env, &id);

        client.init(&owner);
        client.grant_access(&patient, &staff, &record, &3600);

        let perms = client.get_patient_permissions(&patient);
        assert_eq!(perms.len(), 1, "expected one permission after grant");
        let (p, g, r) = perms.get(0).unwrap();
        assert_eq!(p, patient);
        assert_eq!(g, staff);
        assert_eq!(r, record);
    }

    #[test]
    fn grant_and_check_access_within_expiry() {
        let (env, owner, patient, staff, record) = setup();
        let id = env.register_contract(None, AccessManager);
        let client = AccessManagerClient::new(&env, &id);

        client.init(&owner);
        client.grant_access(&patient, &staff, &record, &3600);
        assert!(client.check_access(&patient, &staff, &record));
    }

    #[test]
    fn revoke_access_flips_active_flag() {
        let (env, owner, patient, staff, record) = setup();
        let id = env.register_contract(None, AccessManager);
        let client = AccessManagerClient::new(&env, &id);

        client.init(&owner);
        client.grant_access(&patient, &staff, &record, &3600);
        client.revoke_access(&patient, &staff, &record);
        assert!(!client.check_access(&patient, &staff, &record));
    }
}