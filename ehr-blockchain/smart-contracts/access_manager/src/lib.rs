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
        provider: Address,
        patient: Address,
        patient_id: BytesN<32>,
        granted_to: BytesN<32>,
        record_id: BytesN<32>,
        duration_seconds: u64,
    ) {
        provider.require_auth();
        patient.require_auth();

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

        perms.push_back((patient_id.clone(), granted_to, record_id));
        env.storage()
            .persistent()
            .set(&DataKey::PatientPermissions(patient_id), &perms);
    }

    pub fn revoke_access(
        env: Env,
        provider: Address,
        patient: Address,
        patient_id: BytesN<32>,
        granted_to: BytesN<32>,
        record_id: BytesN<32>,
    ) {
        provider.require_auth();
        patient.require_auth();

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

    struct Ctx {
        env: Env,
        client: AccessManagerClient<'static>,
        owner: Address,
        provider: Address,
        patient: Address,
        patient_id: BytesN<32>,
        staff: BytesN<32>,
        record: BytesN<32>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let provider = Address::generate(&env);
        let patient = Address::generate(&env);
        let id = env.register_contract(None, AccessManager);
        let client = AccessManagerClient::new(&env, &id);
        client.init(&owner);
        Ctx {
            env: env.clone(),
            client,
            owner,
            provider,
            patient,
            patient_id: BytesN::from_array(&env, &[1u8; 32]),
            staff: BytesN::from_array(&env, &[2u8; 32]),
            record: BytesN::from_array(&env, &[3u8; 32]),
        }
    }

    #[test]
    fn grant_access_persists_patient_permissions_vector() {
        let c = setup();
        c.client.grant_access(&c.provider, &c.patient, &c.patient_id, &c.staff, &c.record, &3600);
        let perms = c.client.get_patient_permissions(&c.patient_id);
        assert_eq!(perms.len(), 1);
        let (p, g, r) = perms.get(0).unwrap();
        assert_eq!(p, c.patient_id);
        assert_eq!(g, c.staff);
        assert_eq!(r, c.record);
    }

    #[test]
    fn grant_and_check_access_within_expiry() {
        let c = setup();
        c.client.grant_access(&c.provider, &c.patient, &c.patient_id, &c.staff, &c.record, &3600);
        assert!(c.client.check_access(&c.patient_id, &c.staff, &c.record));
    }

    #[test]
    fn revoke_access_flips_active_flag() {
        let c = setup();
        c.client.grant_access(&c.provider, &c.patient, &c.patient_id, &c.staff, &c.record, &3600);
        c.client.revoke_access(&c.provider, &c.patient, &c.patient_id, &c.staff, &c.record);
        assert!(!c.client.check_access(&c.patient_id, &c.staff, &c.record));
    }

    /// With both `provider` and `patient` mocked as authorized, the call succeeds.
    #[test]
    fn grant_access_succeeds_with_both_signatures() {
        let c = setup(); // mock_all_auths covers both
        c.client.grant_access(&c.provider, &c.patient, &c.patient_id, &c.staff, &c.record, &3600);
        assert!(c.client.check_access(&c.patient_id, &c.staff, &c.record));
    }

    /// With only the provider authorized (no patient signature), the call must panic.
    #[test]
    #[should_panic]
    fn grant_access_fails_without_patient_auth() {
        use soroban_sdk::testutils::MockAuth;
        use soroban_sdk::testutils::MockAuthInvoke;
        use soroban_sdk::IntoVal;

        let env = Env::default();
        let owner = Address::generate(&env);
        let provider = Address::generate(&env);
        let patient = Address::generate(&env);
        let id = env.register_contract(None, AccessManager);
        let client = AccessManagerClient::new(&env, &id);
        // init still uses owner (mock all for init)
        env.mock_all_auths();
        client.init(&owner);

        // Now restrict mocks: only the provider has a valid auth entry.
        let patient_id = BytesN::from_array(&env, &[1u8; 32]);
        let staff = BytesN::from_array(&env, &[2u8; 32]);
        let record = BytesN::from_array(&env, &[3u8; 32]);
        let duration: u64 = 3600;

        client
            .mock_auths(&[MockAuth {
                address: &provider,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "grant_access",
                    args: (provider.clone(), patient.clone(), patient_id.clone(), staff.clone(), record.clone(), duration).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .grant_access(&provider, &patient, &patient_id, &staff, &record, &duration);
    }

    /// Symmetric assertion for revoke.
    #[test]
    #[should_panic]
    fn revoke_access_fails_without_patient_auth() {
        use soroban_sdk::testutils::MockAuth;
        use soroban_sdk::testutils::MockAuthInvoke;
        use soroban_sdk::IntoVal;

        let env = Env::default();
        let owner = Address::generate(&env);
        let provider = Address::generate(&env);
        let patient = Address::generate(&env);
        let id = env.register_contract(None, AccessManager);
        let client = AccessManagerClient::new(&env, &id);
        env.mock_all_auths();
        client.init(&owner);
        let patient_id = BytesN::from_array(&env, &[1u8; 32]);
        let staff = BytesN::from_array(&env, &[2u8; 32]);
        let record = BytesN::from_array(&env, &[3u8; 32]);
        client.grant_access(&provider, &patient, &patient_id, &staff, &record, &3600);

        // Revoke with only provider authorized.
        client
            .mock_auths(&[MockAuth {
                address: &provider,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "revoke_access",
                    args: (provider.clone(), patient.clone(), patient_id.clone(), staff.clone(), record.clone()).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .revoke_access(&provider, &patient, &patient_id, &staff, &record);
    }
}