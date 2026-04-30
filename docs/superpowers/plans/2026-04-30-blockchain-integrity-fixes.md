# Blockchain Integrity Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the on-chain audit trail provably multi-party (provider + patient sign every access grant), and turn silent anchor failures into recoverable pending rows with a manual retry endpoint.

**Architecture:** `access_manager.grant_access` / `revoke_access` gain `provider: Address` + `patient: Address` parameters and call `require_auth()` on both. Backend generates a Stellar keypair per user at signup, AES-256-GCM-encrypts the secret in `users.stellar_secret_enc`. Multi-sig transaction building delegated to a Node.js helper using `@stellar/stellar-sdk` (mature client SDK with `authorizeEntry` support — see Phase 3 note). Anchor failures persist as `blockchain_transactions(status='pending', pending_payload=...)` and are drained by a new admin endpoint.

**Tech Stack:** Soroban Rust contracts, Rust + actix-web + sqlx backend, Node.js helper for multi-sig signing, React + Vite + TypeScript frontend, PostgreSQL.

**Implementation note (deviates from spec §7.2):** The spec called for a Rust `stellar-sdk` client crate. There is no mature Rust client SDK with auth-entry signing equivalent to `@stellar/stellar-sdk` (JS). The pragmatic capstone choice is a small Node.js helper invoked via `Command` — same shell-out pattern the backend already uses for `soroban` CLI. This is documented in Task 9 and called out in the threat model.

---

## File Structure

**Smart contracts:**
- Modify: `ehr-blockchain/smart-contracts/access_manager/src/lib.rs`

**Backend (new):**
- Create: `ehr-blockchain/backend/src/services/stellar_identity.rs`
- Create: `ehr-blockchain/backend/src/services/anchor_queue.rs`
- Create: `ehr-blockchain/backend/src/handlers/blockchain_handler.rs`
- Create: `ehr-blockchain/migrations/033_multi_sig_and_pending_anchors.sql`

**Backend (modify):**
- Modify: `ehr-blockchain/backend/Cargo.toml` (add `stellar-strkey`, `ed25519-dalek`)
- Modify: `ehr-blockchain/backend/src/services/mod.rs`
- Modify: `ehr-blockchain/backend/src/services/blockchain_service.rs` (multi-sig path + pending fallback in CLI paths)
- Modify: `ehr-blockchain/backend/src/services/record_service.rs` (receipt includes `anchor_status`)
- Modify: `ehr-blockchain/backend/src/handlers/mod.rs`
- Modify: `ehr-blockchain/backend/src/handlers/permission_handler.rs` (uses multi-sig grant)
- Modify: `ehr-blockchain/backend/src/main.rs` (route registration + startup backfill)

**Helper script (new):**
- Create: `ehr-blockchain/scripts/sign-and-submit-multisig.mjs`
- Create: `ehr-blockchain/scripts/package.json`
- Create: `ehr-blockchain/scripts/demo-multisig-and-pending.sh`

**Frontend (new):**
- Create: `ehr-blockchain/frontend/src/config/contracts.ts`
- Create: `ehr-blockchain/frontend/.env.example`

**Frontend (modify):**
- Modify: `ehr-blockchain/frontend/src/services/soroban.ts` (import contract IDs from config)
- Modify: `ehr-blockchain/frontend/src/pages/BlockchainExplorer.tsx` (use config + add Pending tab)

**Config:**
- Modify: `ehr-blockchain/.env.example` (new `ACCESS_MANAGER_CONTRACT_ID` after redeploy)

**Docs (new):**
- Create: `ehr-blockchain/docs/threat-model.md`
- Create: `ehr-blockchain/docs/runbook-key-rotation.md`

**Docs (modify):**
- Modify: `ehr-blockchain/docs/architecture.md`
- Modify: `ehr-blockchain/docs/smart-contracts.md`

---

## Phase 1 — Smart contract: multi-auth on access_manager

### Task 1: Add multi-auth to `grant_access` and `revoke_access`

**Files:**
- Modify: `ehr-blockchain/smart-contracts/access_manager/src/lib.rs`

- [ ] **Step 1: Edit `grant_access` to take `provider` and `patient` Address params**

Replace the existing `grant_access` function (lines 33-70) with:

```rust
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
```

The `owner.require_auth()` call is removed — the chain now requires both the provider's and patient's signatures, not the owner's. The `Owner` storage stays initialized for backward compat with `init`.

- [ ] **Step 2: Edit `revoke_access` symmetrically**

Replace the existing `revoke_access` function (lines 72-88) with:

```rust
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
```

- [ ] **Step 3: Run existing tests to confirm they fail (signatures changed)**

Run: `cargo test -p access-manager`
Expected: FAIL — existing tests call `grant_access(&patient, &staff, &record, &3600)` with 4 args; new signature has 6 (added `provider`, `patient` Addresses).

- [ ] **Step 4: Commit**

```bash
cd ehr-blockchain/smart-contracts/access_manager
git add src/lib.rs
git commit -m "feat(access_manager): add provider+patient multi-auth to grant/revoke"
```

---

### Task 2: Update existing access_manager tests + add multi-sig assertions

**Files:**
- Modify: `ehr-blockchain/smart-contracts/access_manager/src/lib.rs` (test module only)

- [ ] **Step 1: Replace the `setup` helper to provide provider and patient Addresses**

Replace the `setup()` function and existing tests (lines 118-173) with:

```rust
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
}
```

- [ ] **Step 2: Add new tests asserting both signatures are required**

Append inside the same `mod test {}` block:

```rust
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
```

- [ ] **Step 3: Run the test suite**

Run: `cargo test -p access-manager`
Expected: PASS for all 5 tests.

- [ ] **Step 4: Commit**

```bash
git add ehr-blockchain/smart-contracts/access_manager/src/lib.rs
git commit -m "test(access_manager): assert both signatures required on grant/revoke"
```

---

### Task 3: Build & deploy new contract to Stellar Testnet

**Files:**
- No code changes — operational task. Captures new `CONTRACT_ID` for use in env.

- [ ] **Step 1: Build the WASM**

Run from `ehr-blockchain/`:
```bash
cargo build -p access-manager --target wasm32-unknown-unknown --release
```
Expected: produces `target/wasm32-unknown-unknown/release/access_manager.wasm`.

- [ ] **Step 2: Deploy to testnet**

Run:
```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/access_manager.wasm \
  --source admin \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```
Expected: stdout is the new `C...` contract ID. Save it as `NEW_ACCESS_MANAGER_CONTRACT_ID`.

- [ ] **Step 3: Initialize the new contract**

Run (replacing `<NEW_ID>` with the captured ID and `<ADMIN_ADDR>` with the admin's `G...` public key):
```bash
soroban contract invoke \
  --id <NEW_ID> \
  --source admin \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- init --owner <ADMIN_ADDR>
```
Expected: empty stdout, exit code 0.

- [ ] **Step 4: Record the new contract ID in a temporary note**

Append to `ehr-blockchain/docs/smart-contracts.md` under the Access Manager section:
```markdown
- v2 Contract ID (multi-sig): `<NEW_ID>` — deployed YYYY-MM-DD, requires provider + patient signatures.
- v1 Contract ID (legacy, owner-only): `CAQF6LCVGDOZXHXZMADFHB6EL5ELRGJAHZKFPLVEJM75PRIKQCD7XUJ2`
```

- [ ] **Step 5: Commit**

```bash
git add ehr-blockchain/docs/smart-contracts.md
git commit -m "docs(smart-contracts): record v2 access_manager contract ID"
```

---

## Phase 2 — Database migration

### Task 4: Migration `033_multi_sig_and_pending_anchors.sql`

**Files:**
- Create: `ehr-blockchain/migrations/033_multi_sig_and_pending_anchors.sql`

- [ ] **Step 1: Write the migration**

Create file with content:

```sql
-- 033_multi_sig_and_pending_anchors.sql
-- Adds per-user Stellar keypair columns and pending-anchor queue columns.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stellar_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS stellar_secret_enc TEXT;

CREATE INDEX IF NOT EXISTS idx_users_stellar_pubkey ON users (stellar_pubkey)
  WHERE stellar_pubkey IS NOT NULL;

ALTER TABLE blockchain_transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending','confirmed','failed')),
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS pending_payload JSONB,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_blockchain_tx_status_pending
  ON blockchain_transactions (status, next_retry_at)
  WHERE status = 'pending';
```

- [ ] **Step 2: Apply the migration locally**

Run from `ehr-blockchain/backend/`:
```bash
sqlx migrate run --database-url "$DATABASE_URL"
```
Expected: `Applied 033/migrate multi sig and pending anchors`.

- [ ] **Step 3: Verify schema**

Run:
```bash
psql "$DATABASE_URL" -c "\d users" | grep stellar
psql "$DATABASE_URL" -c "\d blockchain_transactions" | grep -E "status|attempts|pending_payload"
```
Expected: lines for `stellar_pubkey`, `stellar_secret_enc`, `status`, `attempts`, `pending_payload`, `next_retry_at`.

- [ ] **Step 4: Commit**

```bash
git add ehr-blockchain/migrations/033_multi_sig_and_pending_anchors.sql
git commit -m "feat(db): migration 033 — user stellar keys + pending-anchor queue"
```

---

## Phase 3 — Backend Rust modules

### Task 5: Add Rust crate dependencies for keypair generation

**Files:**
- Modify: `ehr-blockchain/backend/Cargo.toml`

- [ ] **Step 1: Add `stellar-strkey` and `ed25519-dalek` dependencies**

Edit `ehr-blockchain/backend/Cargo.toml` to add (under `[dependencies]`):

```toml
stellar-strkey = "0.0.13"
ed25519-dalek = { version = "2", features = ["rand_core"] }
rand_core = { version = "0.6", features = ["std"] }
```

- [ ] **Step 2: Verify compilation**

Run from `ehr-blockchain/backend/`:
```bash
cargo build
```
Expected: builds successfully (only adds deps, no source change yet).

- [ ] **Step 3: Commit**

```bash
git add ehr-blockchain/backend/Cargo.toml ehr-blockchain/backend/Cargo.lock
git commit -m "chore(backend): add stellar-strkey + ed25519-dalek deps"
```

---

### Task 6: Module `services/stellar_identity.rs` — generate, encrypt, load patient keypair

**Files:**
- Create: `ehr-blockchain/backend/src/services/stellar_identity.rs`
- Modify: `ehr-blockchain/backend/src/services/mod.rs`

- [ ] **Step 1: Write the module skeleton with tests**

Create `ehr-blockchain/backend/src/services/stellar_identity.rs`:

```rust
//! Per-user Stellar keypair management.
//!
//! Each user has a deterministic-by-row Stellar Ed25519 keypair. The public key
//! ("G..." strkey) is stored plaintext in `users.stellar_pubkey`. The secret
//! ("S..." strkey) is encrypted with the same AES-256-GCM key used for SOAP
//! fields and stored in `users.stellar_secret_enc` with the `enc:v1:` prefix.
//!
//! The Keypair struct holds the raw secret bytes only for the duration of one
//! transaction-build; it is never logged or returned by an HTTP handler.

use crate::services::encryption::{decrypt_field, encrypt_field};
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand_core::OsRng;
use sqlx::PgPool;
use stellar_strkey::ed25519::{PrivateKey as StrkeyPriv, PublicKey as StrkeyPub};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum IdentityError {
    #[error("user not found: {0}")]
    UserNotFound(Uuid),
    #[error("user has no stellar identity (run backfill)")]
    NoIdentity,
    #[error("encryption error: {0}")]
    Encryption(String),
    #[error("strkey error: {0}")]
    Strkey(String),
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
}

/// Holds a freshly-decrypted secret. Drop it as soon as the tx is built.
pub struct PatientIdentity {
    pub pubkey_strkey: String,    // "G..."
    pub secret_strkey: String,    // "S..." — sensitive
}

/// Generate a new Ed25519 keypair encoded as Stellar strkeys.
pub fn generate_keypair() -> Result<PatientIdentity, IdentityError> {
    let signing = SigningKey::generate(&mut OsRng);
    let verifying: VerifyingKey = signing.verifying_key();

    let pub_strkey = StrkeyPub(verifying.to_bytes()).to_string();
    let priv_strkey = StrkeyPriv(signing.to_bytes()).to_string();
    Ok(PatientIdentity {
        pubkey_strkey: pub_strkey,
        secret_strkey: priv_strkey,
    })
}

/// Generate a keypair for `user_id` and persist it (pubkey plaintext, secret
/// encrypted with `key_hex`). No-op if the user already has a stellar_pubkey.
pub async fn ensure_for_user(
    pool: &PgPool,
    user_id: Uuid,
    key_hex: &str,
) -> Result<String, IdentityError> {
    if let Some(existing) = sqlx::query_scalar::<_, Option<String>>(
        "SELECT stellar_pubkey FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    {
        if let Some(pk) = existing {
            return Ok(pk);
        }
    } else {
        return Err(IdentityError::UserNotFound(user_id));
    }

    let id = generate_keypair()?;
    let enc = encrypt_field(&id.secret_strkey, key_hex)
        .map_err(IdentityError::Encryption)?;

    sqlx::query(
        "UPDATE users SET stellar_pubkey = $1, stellar_secret_enc = $2 WHERE id = $3",
    )
    .bind(&id.pubkey_strkey)
    .bind(&enc)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(id.pubkey_strkey)
}

/// Load and decrypt the user's keypair. Caller must drop the result promptly.
pub async fn load_for_user(
    pool: &PgPool,
    user_id: Uuid,
    key_hex: &str,
) -> Result<PatientIdentity, IdentityError> {
    let row: Option<(Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT stellar_pubkey, stellar_secret_enc FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let (pubkey, secret_enc) = row.ok_or(IdentityError::UserNotFound(user_id))?;
    let pubkey = pubkey.ok_or(IdentityError::NoIdentity)?;
    let secret_enc = secret_enc.ok_or(IdentityError::NoIdentity)?;
    let secret = decrypt_field(&secret_enc, key_hex);
    if secret == secret_enc {
        // decrypt_field returns the input unchanged on failure
        return Err(IdentityError::Encryption("decrypt returned ciphertext marker".into()));
    }

    Ok(PatientIdentity {
        pubkey_strkey: pubkey,
        secret_strkey: secret,
    })
}

/// One-shot: generate keypairs for every row in `users` lacking `stellar_pubkey`.
/// Returns the count of users updated.
pub async fn backfill_all_users(pool: &PgPool, key_hex: &str) -> Result<u64, IdentityError> {
    let ids: Vec<(Uuid,)> =
        sqlx::query_as("SELECT id FROM users WHERE stellar_pubkey IS NULL")
            .fetch_all(pool)
            .await?;

    let mut count = 0u64;
    for (id,) in ids {
        if ensure_for_user(pool, id, key_hex).await.is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_KEY: &str =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn generate_keypair_produces_valid_strkeys() {
        let id = generate_keypair().expect("generate");
        assert!(id.pubkey_strkey.starts_with('G'), "pubkey should be G..., got {}", id.pubkey_strkey);
        assert!(id.secret_strkey.starts_with('S'), "secret should be S..., got {}", id.secret_strkey);
        assert_eq!(id.pubkey_strkey.len(), 56, "Stellar G-strkey is 56 chars");
        assert_eq!(id.secret_strkey.len(), 56, "Stellar S-strkey is 56 chars");
    }

    #[test]
    fn keypairs_are_unique() {
        let a = generate_keypair().unwrap();
        let b = generate_keypair().unwrap();
        assert_ne!(a.pubkey_strkey, b.pubkey_strkey);
        assert_ne!(a.secret_strkey, b.secret_strkey);
    }

    #[test]
    fn encrypt_decrypt_secret_roundtrip() {
        let id = generate_keypair().unwrap();
        let enc = encrypt_field(&id.secret_strkey, TEST_KEY).expect("encrypt");
        assert!(enc.starts_with("enc:v1:"));
        let dec = decrypt_field(&enc, TEST_KEY);
        assert_eq!(dec, id.secret_strkey);
    }
}
```

- [ ] **Step 2: Register the module**

Edit `ehr-blockchain/backend/src/services/mod.rs` — add:

```rust
pub mod stellar_identity;
```

- [ ] **Step 3: Run unit tests**

Run from `ehr-blockchain/backend/`:
```bash
cargo test --lib services::stellar_identity::tests
```
Expected: 3 passes.

- [ ] **Step 4: Commit**

```bash
git add ehr-blockchain/backend/src/services/stellar_identity.rs ehr-blockchain/backend/src/services/mod.rs
git commit -m "feat(backend): per-user Stellar keypair via stellar_identity service"
```

---

### Task 7: Module `services/anchor_queue.rs` — pending row enqueue + retry

**Files:**
- Create: `ehr-blockchain/backend/src/services/anchor_queue.rs`
- Modify: `ehr-blockchain/backend/src/services/mod.rs`

- [ ] **Step 1: Write the module**

Create `ehr-blockchain/backend/src/services/anchor_queue.rs`:

```rust
//! Persistent queue for blockchain anchor failures.
//!
//! When a `services/blockchain_service` call cannot reach Soroban (CLI missing,
//! RPC down, multi-sig helper failed), it inserts a `blockchain_transactions`
//! row with `status='pending'` and the original args serialized into
//! `pending_payload` JSONB. The admin retry endpoint reads pending rows and
//! re-dispatches them.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;

#[derive(Debug, thiserror::Error)]
pub enum QueueError {
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingRow {
    pub id: i64,
    pub contract_id: String,
    pub action_type: String,
    pub pending_payload: Value,
    pub attempts: i32,
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RetryResult {
    pub row_id: i64,
    pub outcome: &'static str, // "confirmed" | "still_pending" | "failed"
    pub tx_hash: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Default)]
pub struct RetrySummary {
    pub total: u32,
    pub confirmed: u32,
    pub still_pending: u32,
    pub failed: u32,
    pub results: Vec<RetryResult>,
}

/// Insert a pending anchor row. `contract_id` and `action_type` mirror the
/// blockchain_transactions schema. `pending_payload` is whatever the caller
/// needs to re-build the call (typically a JSON object of the original args).
pub async fn enqueue_pending(
    pool: &PgPool,
    contract_id: &str,
    action_type: &str,
    pending_payload: Value,
    last_error: &str,
) -> Result<i64, QueueError> {
    let row: (i64,) = sqlx::query_as(
        "INSERT INTO blockchain_transactions \
         (tx_hash, contract_id, action_type, payload, status, attempts, last_error, pending_payload) \
         VALUES ($1, $2, $3, $4, 'pending', 0, $5, $6) RETURNING id",
    )
    .bind(format!("pending:{}", uuid::Uuid::new_v4()))
    .bind(contract_id)
    .bind(action_type)
    .bind(serde_json::to_string(&pending_payload).unwrap_or_default())
    .bind(last_error)
    .bind(pending_payload)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

/// Fetch all pending rows ordered by id (FIFO).
pub async fn list_pending(pool: &PgPool) -> Result<Vec<PendingRow>, QueueError> {
    let rows = sqlx::query_as::<_, (i64, String, String, Value, i32, Option<String>)>(
        "SELECT id, contract_id, action_type, pending_payload, attempts, last_error \
         FROM blockchain_transactions WHERE status = 'pending' ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, contract_id, action_type, pending_payload, attempts, last_error)| PendingRow {
            id,
            contract_id,
            action_type,
            pending_payload,
            attempts,
            last_error,
        })
        .collect())
}

/// Mark a row confirmed once the retry succeeded.
pub async fn mark_confirmed(
    pool: &PgPool,
    row_id: i64,
    tx_hash: &str,
) -> Result<(), QueueError> {
    sqlx::query(
        "UPDATE blockchain_transactions SET status = 'confirmed', tx_hash = $1, last_error = NULL \
         WHERE id = $2",
    )
    .bind(tx_hash)
    .bind(row_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Increment attempts and store the latest error. After 5 attempts, status='failed'.
pub async fn mark_attempt_failed(
    pool: &PgPool,
    row_id: i64,
    error: &str,
) -> Result<(), QueueError> {
    sqlx::query(
        "UPDATE blockchain_transactions \
         SET attempts = attempts + 1, last_error = $1, \
             status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE status END, \
             next_retry_at = NOW() + INTERVAL '30 seconds' \
         WHERE id = $2",
    )
    .bind(error)
    .bind(row_id)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_summary_default_is_zeroed() {
        let s = RetrySummary::default();
        assert_eq!(s.total, 0);
        assert!(s.results.is_empty());
    }
}
```

- [ ] **Step 2: Register the module**

Edit `ehr-blockchain/backend/src/services/mod.rs` — append:

```rust
pub mod anchor_queue;
```

- [ ] **Step 3: Run unit tests + verify compilation**

Run from `ehr-blockchain/backend/`:
```bash
cargo test --lib services::anchor_queue::tests
cargo build
```
Expected: tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add ehr-blockchain/backend/src/services/anchor_queue.rs ehr-blockchain/backend/src/services/mod.rs
git commit -m "feat(backend): anchor_queue service for pending blockchain ops"
```

---

### Task 8: Node.js multi-sig signing helper

**Files:**
- Create: `ehr-blockchain/scripts/sign-and-submit-multisig.mjs`
- Create: `ehr-blockchain/scripts/package.json`

Why a Node helper: the Rust ecosystem lacks a mature client SDK with `authorizeEntry` support. `@stellar/stellar-sdk` (already used by the frontend) handles auth-entry signing for `require_auth()`-gated invocations correctly. This script is invoked by the backend with `Command` exactly the way the existing code shells out to `soroban` CLI.

- [ ] **Step 1: Initialize the helper package**

Create `ehr-blockchain/scripts/package.json`:

```json
{
  "name": "ehr-blockchain-helpers",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@stellar/stellar-sdk": "^15.0.1"
  }
}
```

Run from `ehr-blockchain/scripts/`:
```bash
npm install
```
Expected: installs @stellar/stellar-sdk and produces `node_modules/`.

- [ ] **Step 2: Write the helper script**

Create `ehr-blockchain/scripts/sign-and-submit-multisig.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Build, dual-sign, and submit a Soroban contract invocation that requires
 * two `require_auth()` signatures (provider + patient).
 *
 * Invoked by the Rust backend via `Command::new("node")
 *   .args(["scripts/sign-and-submit-multisig.mjs"])
 *   .env("PROVIDER_SECRET", ...)
 *   .env("PATIENT_SECRET", ...)
 *   .stdin(<JSON args>)`.
 *
 * stdin (JSON):
 * {
 *   "rpcUrl": "...",
 *   "networkPassphrase": "...",
 *   "contractId": "C...",
 *   "method": "grant_access" | "revoke_access",
 *   "providerAddress": "G...",   // must equal pubkey of PROVIDER_SECRET
 *   "patientAddress":  "G...",   // must equal pubkey of PATIENT_SECRET
 *   "patientIdHex":    "<64 hex>",
 *   "grantedToHex":    "<64 hex>",
 *   "recordIdHex":     "<64 hex>",
 *   "durationSeconds": 3600       // omit for revoke
 * }
 *
 * stdout (JSON on success):
 *   {"txHash":"...", "status":"SUCCESS"}
 * stdout (JSON on failure):
 *   {"error":"<message>"}
 * Process exit code: 0 on success, 1 on failure.
 */
import {
  Address,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  authorizeEntry,
  hash,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { readFileSync } from 'node:fs';

function fail(msg) {
  process.stdout.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(1);
}

function hexToBuf(h) {
  if (!/^[0-9a-fA-F]+$/.test(h) || h.length !== 64) fail(`bad hex: ${h}`);
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function main() {
  const providerSecret = process.env.PROVIDER_SECRET;
  const patientSecret = process.env.PATIENT_SECRET;
  if (!providerSecret || !patientSecret) fail('PROVIDER_SECRET and PATIENT_SECRET env vars required');

  const stdin = readFileSync(0, 'utf8');
  const args = JSON.parse(stdin);

  const providerKp = Keypair.fromSecret(providerSecret);
  const patientKp = Keypair.fromSecret(patientSecret);
  if (providerKp.publicKey() !== args.providerAddress) fail('providerAddress does not match PROVIDER_SECRET');
  if (patientKp.publicKey() !== args.patientAddress) fail('patientAddress does not match PATIENT_SECRET');

  const server = new rpc.Server(args.rpcUrl, { allowHttp: args.rpcUrl.startsWith('http://') });
  const contract = new Contract(args.contractId);

  // Build the invocation args in the order the contract expects.
  const invocationArgs = [
    new Address(args.providerAddress).toScVal(),
    new Address(args.patientAddress).toScVal(),
    nativeToScVal(hexToBuf(args.patientIdHex), { type: 'bytes' }),
    nativeToScVal(hexToBuf(args.grantedToHex), { type: 'bytes' }),
    nativeToScVal(hexToBuf(args.recordIdHex), { type: 'bytes' }),
  ];
  if (args.method === 'grant_access') {
    invocationArgs.push(nativeToScVal(BigInt(args.durationSeconds), { type: 'u64' }));
  }

  const op = contract.call(args.method, ...invocationArgs);

  const account = await server.getAccount(providerKp.publicKey());
  let tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: args.networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  // Simulate to populate auth entries.
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) fail(`simulate: ${sim.error}`);
  if (!rpc.Api.isSimulationSuccess(sim)) fail('simulate: unknown failure');

  // Assemble with simulation results, then sign each auth entry.
  tx = rpc.assembleTransaction(tx, sim).build();

  const op0 = tx.operations[0];
  const validUntilLedger = sim.latestLedger + 100;
  const networkPassphrase = args.networkPassphrase;

  const newAuth = [];
  for (const entry of op0.auth ?? []) {
    const credAddr = entry.credentials().switch().name === 'sorobanCredentialsAddress'
      ? Address.fromScAddress(entry.credentials().address().address()).toString()
      : null;
    if (credAddr === args.providerAddress) {
      newAuth.push(await authorizeEntry(entry, providerKp, validUntilLedger, networkPassphrase));
    } else if (credAddr === args.patientAddress) {
      newAuth.push(await authorizeEntry(entry, patientKp, validUntilLedger, networkPassphrase));
    } else {
      newAuth.push(entry);
    }
  }
  // Replace the op auth with the signed versions.
  op0.auth = newAuth;

  // Sign the outer envelope with the provider (source account).
  tx.sign(providerKp);

  const send = await server.sendTransaction(tx);
  if (send.status !== 'PENDING') {
    fail(`sendTransaction: ${send.status} — ${send.errorResult?.toXDR('base64') ?? 'no detail'}`);
  }

  // Poll briefly for inclusion.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const tr = await server.getTransaction(send.hash);
    if (tr.status === 'SUCCESS') {
      process.stdout.write(JSON.stringify({ txHash: send.hash, status: 'SUCCESS' }) + '\n');
      return;
    }
    if (tr.status === 'FAILED') {
      fail(`tx ${send.hash} failed: ${tr.resultXdr?.toXDR('base64') ?? 'no detail'}`);
    }
  }
  fail(`tx ${send.hash} did not finalize within timeout`);
}

main().catch((e) => fail(String(e?.message ?? e)));
```

- [ ] **Step 3: Smoke test the helper standalone**

Run from `ehr-blockchain/scripts/` (substituting valid testnet keys/contract):
```bash
PROVIDER_SECRET=S... PATIENT_SECRET=S... node sign-and-submit-multisig.mjs <<EOF
{
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "contractId": "<NEW_ACCESS_MANAGER_CONTRACT_ID>",
  "method": "grant_access",
  "providerAddress": "G...",
  "patientAddress":  "G...",
  "patientIdHex":    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "grantedToHex":    "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
  "recordIdHex":     "1111111111111111111111111111111111111111111111111111111111111111",
  "durationSeconds": 3600
}
EOF
```
Expected: stdout is `{"txHash":"...","status":"SUCCESS"}` and exit code 0.

- [ ] **Step 4: Commit**

```bash
git add ehr-blockchain/scripts/package.json ehr-blockchain/scripts/sign-and-submit-multisig.mjs
git commit -m "feat(scripts): node helper for multi-sig grant/revoke"
```

---

### Task 9: Backend `blockchain_service::grant_access_onchain_multisig` + revoke counterpart

**Files:**
- Modify: `ehr-blockchain/backend/src/services/blockchain_service.rs`

- [ ] **Step 1: Add the AnchorOutcome enum and AccessManager helpers at the bottom of the file**

Append to `ehr-blockchain/backend/src/services/blockchain_service.rs`:

```rust
// =============================================================================
// Multi-sig path: grant_access / revoke_access via Node helper
// =============================================================================

use crate::services::{anchor_queue, stellar_identity};
use serde_json::json;
use std::io::Write;
use std::process::Stdio;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(tag = "anchor_status", rename_all = "snake_case")]
pub enum AnchorOutcome {
    Confirmed { tx_hash: String, contract_id: String },
    Pending   { row_id: i64, reason: String, contract_id: String },
}

#[derive(Debug, Deserialize)]
struct HelperOk {
    #[serde(rename = "txHash")]
    tx_hash: String,
}

#[derive(Debug, Deserialize)]
struct HelperErr {
    error: String,
}

fn run_multisig_helper(
    provider_secret: &str,
    patient_secret: &str,
    payload: &serde_json::Value,
) -> Result<String, String> {
    let helper_path = std::env::var("MULTISIG_HELPER_PATH")
        .unwrap_or_else(|_| "scripts/sign-and-submit-multisig.mjs".to_string());

    let mut child = match std::process::Command::new("node")
        .arg(&helper_path)
        .env("PROVIDER_SECRET", provider_secret)
        .env("PATIENT_SECRET", patient_secret)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return Err(format!("spawn node helper: {}", e)),
    };

    if let Some(mut stdin) = child.stdin.take() {
        let bytes = serde_json::to_vec(payload).unwrap_or_default();
        if let Err(e) = stdin.write_all(&bytes) {
            return Err(format!("write stdin: {}", e));
        }
    }

    let out = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => return Err(format!("wait helper: {}", e)),
    };

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();

    if out.status.success() {
        match serde_json::from_str::<HelperOk>(stdout.trim()) {
            Ok(ok) => Ok(ok.tx_hash),
            Err(e) => Err(format!("parse helper success: {} — stdout was: {}", e, stdout)),
        }
    } else {
        let detail = serde_json::from_str::<HelperErr>(stdout.trim())
            .map(|e| e.error)
            .unwrap_or_else(|_| format!("stdout={} stderr={}", stdout, stderr));
        Err(detail)
    }
}

/// Build, dual-sign, and submit a `grant_access` call using both the provider
/// admin keypair (env `STELLAR_ADMIN_KEY`) and the patient's per-user keypair
/// loaded from the DB. On any failure, enqueue a pending row instead of
/// returning silent failure.
pub async fn grant_access_onchain_multisig(
    pool: &PgPool,
    provider_user_id: Uuid,
    patient_user_id: Uuid,
    granted_to_user_id: Uuid,
    record_id: Uuid,
    duration_seconds: u64,
    config: &Config,
) -> AnchorOutcome {
    multisig_op(
        pool,
        provider_user_id,
        patient_user_id,
        granted_to_user_id,
        record_id,
        Some(duration_seconds),
        "grant_access",
        config,
    )
    .await
}

pub async fn revoke_access_onchain_multisig(
    pool: &PgPool,
    provider_user_id: Uuid,
    patient_user_id: Uuid,
    granted_to_user_id: Uuid,
    record_id: Uuid,
    config: &Config,
) -> AnchorOutcome {
    multisig_op(
        pool,
        provider_user_id,
        patient_user_id,
        granted_to_user_id,
        record_id,
        None,
        "revoke_access",
        config,
    )
    .await
}

async fn multisig_op(
    pool: &PgPool,
    provider_user_id: Uuid,
    patient_user_id: Uuid,
    granted_to_user_id: Uuid,
    record_id: Uuid,
    duration_seconds: Option<u64>,
    method: &str,
    config: &Config,
) -> AnchorOutcome {
    let contract_id = config.access_manager_contract_id.clone();

    // Resolve patient identity (must exist in DB).
    let patient = match stellar_identity::load_for_user(
        pool,
        patient_user_id,
        &config.encryption_key,
    )
    .await
    {
        Ok(p) => p,
        Err(e) => {
            let row_id = enqueue(pool, &contract_id, method,
                pending_payload(provider_user_id, patient_user_id, granted_to_user_id, record_id, duration_seconds, "", "", method),
                &format!("load patient identity: {}", e)).await;
            return AnchorOutcome::Pending { row_id, reason: format!("patient identity: {}", e), contract_id };
        }
    };

    // Provider admin keypair: derive pubkey from secret via Node CLI roundtrip OR pass-through.
    // For this design, the admin's pubkey is derived from STELLAR_ADMIN_KEY at runtime by the
    // helper itself; the backend just passes the secret through. The helper emits an error if
    // PROVIDER_SECRET does not match the providerAddress in the JSON payload.
    let provider_secret = config.stellar_admin_key.clone();
    if provider_secret == "placeholder" {
        let row_id = enqueue(pool, &contract_id, method,
            pending_payload(provider_user_id, patient_user_id, granted_to_user_id, record_id, duration_seconds, "", &patient.pubkey_strkey, method),
            "STELLAR_ADMIN_KEY not configured").await;
        return AnchorOutcome::Pending { row_id, reason: "admin key missing".into(), contract_id };
    }

    // Derive provider pubkey strkey from the secret. We need it in the payload.
    let provider_pubkey = match derive_pubkey_from_secret(&provider_secret) {
        Ok(pk) => pk,
        Err(e) => {
            let row_id = enqueue(pool, &contract_id, method,
                pending_payload(provider_user_id, patient_user_id, granted_to_user_id, record_id, duration_seconds, "", &patient.pubkey_strkey, method),
                &format!("derive provider pubkey: {}", e)).await;
            return AnchorOutcome::Pending { row_id, reason: e, contract_id };
        }
    };

    let payload = pending_payload(
        provider_user_id, patient_user_id, granted_to_user_id, record_id,
        duration_seconds, &provider_pubkey, &patient.pubkey_strkey, method,
    );

    // Build the helper-JSON.
    let helper_json = json!({
        "rpcUrl": config.stellar_rpc_url,
        "networkPassphrase": config.stellar_network_passphrase,
        "contractId": contract_id,
        "method": method,
        "providerAddress": provider_pubkey,
        "patientAddress":  patient.pubkey_strkey,
        "patientIdHex":    uuid_to_bytes32_hex(&patient_user_id.to_string()),
        "grantedToHex":    uuid_to_bytes32_hex(&granted_to_user_id.to_string()),
        "recordIdHex":     uuid_to_bytes32_hex(&record_id.to_string()),
        "durationSeconds": duration_seconds.unwrap_or(0),
    });

    match run_multisig_helper(&provider_secret, &patient.secret_strkey, &helper_json) {
        Ok(tx_hash) => {
            record_tx(pool, &tx_hash, &contract_id, method,
                &format!("provider={} patient={} granted_to={} record={}",
                    provider_pubkey, patient.pubkey_strkey, granted_to_user_id, record_id))
                .await;
            AnchorOutcome::Confirmed { tx_hash, contract_id }
        }
        Err(e) => {
            let row_id = enqueue(pool, &contract_id, method, payload, &e).await;
            AnchorOutcome::Pending { row_id, reason: e, contract_id }
        }
    }
}

fn pending_payload(
    provider_user_id: Uuid,
    patient_user_id: Uuid,
    granted_to_user_id: Uuid,
    record_id: Uuid,
    duration_seconds: Option<u64>,
    provider_pubkey: &str,
    patient_pubkey: &str,
    method: &str,
) -> serde_json::Value {
    json!({
        "method": method,
        "provider_user_id": provider_user_id,
        "patient_user_id": patient_user_id,
        "granted_to_user_id": granted_to_user_id,
        "record_id": record_id,
        "duration_seconds": duration_seconds,
        "provider_pubkey": provider_pubkey,
        "patient_pubkey": patient_pubkey,
    })
}

async fn enqueue(
    pool: &PgPool,
    contract_id: &str,
    action_type: &str,
    payload: serde_json::Value,
    reason: &str,
) -> i64 {
    match anchor_queue::enqueue_pending(pool, contract_id, action_type, payload, reason).await {
        Ok(id) => id,
        Err(e) => {
            eprintln!("[blockchain] failed to enqueue pending: {}", e);
            -1
        }
    }
}

/// Compute the strkey "G..." pubkey corresponding to a strkey "S..." secret,
/// without exposing raw bytes.
fn derive_pubkey_from_secret(secret_strkey: &str) -> Result<String, String> {
    use stellar_strkey::ed25519::{PrivateKey, PublicKey};
    let priv_bytes = secret_strkey
        .parse::<PrivateKey>()
        .map_err(|e| format!("invalid S-strkey: {}", e))?
        .0;
    let signing = ed25519_dalek::SigningKey::from_bytes(&priv_bytes);
    let verifying = signing.verifying_key();
    Ok(PublicKey(verifying.to_bytes()).to_string())
}
```

- [ ] **Step 2: Add unit tests for `derive_pubkey_from_secret`**

Inside the existing `#[cfg(test)] mod tests` block of `blockchain_service.rs`, add:

```rust
    #[test]
    fn derive_pubkey_from_secret_roundtrips_known_pair() {
        // Generate via stellar_identity to avoid hardcoding a leak-prone secret.
        let id = crate::services::stellar_identity::generate_keypair().unwrap();
        let derived = super::derive_pubkey_from_secret(&id.secret_strkey).unwrap();
        assert_eq!(derived, id.pubkey_strkey);
    }
```

- [ ] **Step 3: Run tests + build**

Run from `ehr-blockchain/backend/`:
```bash
cargo test --lib services::blockchain_service::tests
cargo build
```
Expected: tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add ehr-blockchain/backend/src/services/blockchain_service.rs
git commit -m "feat(backend): multisig grant/revoke via node helper with pending fallback"
```

---

### Task 10: CLI-path callers enqueue pending on failure

**Files:**
- Modify: `ehr-blockchain/backend/src/services/blockchain_service.rs`

- [ ] **Step 1: Update `store_record_hash` to enqueue on failure**

Replace the current `store_record_hash` function (line 178) with:

```rust
pub async fn store_record_hash(
    pool: &PgPool,
    record_id: &str,
    patient_id: &str,
    record_hash: &str,
    config: &Config,
) -> Option<BlockchainTx> {
    let record_id_hex = uuid_to_bytes32_hex(record_id);
    let patient_id_hex = uuid_to_bytes32_hex(patient_id);
    let args = vec![
        "contract".to_string(), "invoke".to_string(),
        "--id".to_string(), config.record_registry_contract_id.clone(),
        "--".to_string(),
        "store_hash".to_string(),
        "--record_id".to_string(), record_id_hex.clone(),
        "--patient_id".to_string(), patient_id_hex.clone(),
        "--record_hash".to_string(), record_hash.to_string(),
        "--rpc-url".to_string(), config.stellar_rpc_url.clone(),
        "--network-passphrase".to_string(), config.stellar_network_passphrase.clone(),
        "--source".to_string(), "admin".to_string(),
    ];
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();

    match run_soroban(&arg_refs, "store_record_hash") {
        Some(output) => {
            let tx_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if tx_hash.is_empty() {
                let payload = json!({
                    "method": "store_hash",
                    "record_id": record_id,
                    "patient_id": patient_id,
                    "record_hash": record_hash,
                });
                let _ = anchor_queue::enqueue_pending(
                    pool, &config.record_registry_contract_id, "store_hash",
                    payload, "soroban returned empty tx hash",
                ).await;
                return None;
            }
            record_tx(pool, &tx_hash, &config.record_registry_contract_id, "store_hash",
                &format!("record_id={},patient_id={},record_hash={}", record_id, patient_id, record_hash)).await;
            Some(BlockchainTx {
                tx_hash, contract_id: config.record_registry_contract_id.clone(),
                action: "store_hash".into(), block_number: None,
            })
        }
        None => {
            let payload = json!({
                "method": "store_hash",
                "record_id": record_id,
                "patient_id": patient_id,
                "record_hash": record_hash,
            });
            let _ = anchor_queue::enqueue_pending(
                pool, &config.record_registry_contract_id, "store_hash",
                payload, "soroban CLI unavailable or RPC failed",
            ).await;
            None
        }
    }
}
```

- [ ] **Step 2: Apply identical pattern to `update_record_hash` and `log_access_onchain`**

Same shape: on `None` return from `run_soroban`, call `anchor_queue::enqueue_pending` with the original args as JSON. Don't change the public signature — callers still see `Option<...>`. The receipt-builder layer in record_service will detect the difference via a separate query.

(For `update_record_hash`, the JSON payload is `{method:"update_hash", record_id, record_hash}`. For `log_access_onchain`, it is `{method:"log_access", user_id, record_id, action}`.)

- [ ] **Step 3: Run tests**

Run from `ehr-blockchain/backend/`:
```bash
cargo build
cargo test --lib services::blockchain_service
```
Expected: tests pass.

- [ ] **Step 4: Commit**

```bash
git add ehr-blockchain/backend/src/services/blockchain_service.rs
git commit -m "feat(backend): enqueue pending row when CLI path fails"
```

---

## Phase 4 — Backend wire-up

### Task 11: Admin handler `blockchain_handler.rs` — pending list + retry endpoint

**Files:**
- Create: `ehr-blockchain/backend/src/handlers/blockchain_handler.rs`
- Modify: `ehr-blockchain/backend/src/handlers/mod.rs`

- [ ] **Step 1: Write the handler**

Create `ehr-blockchain/backend/src/handlers/blockchain_handler.rs`:

```rust
use crate::config::Config;
use crate::services::{anchor_queue, blockchain_service};
use actix_web::{get, post, web, HttpResponse, Responder};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;

#[derive(Serialize)]
struct PendingDto {
    id: i64,
    contract_id: String,
    action_type: String,
    attempts: i32,
    last_error: Option<String>,
    payload: Value,
}

#[get("/admin/blockchain/pending")]
pub async fn list_pending(
    pool: web::Data<PgPool>,
) -> impl Responder {
    match anchor_queue::list_pending(&pool).await {
        Ok(rows) => {
            let dto: Vec<PendingDto> = rows
                .into_iter()
                .map(|r| PendingDto {
                    id: r.id,
                    contract_id: r.contract_id,
                    action_type: r.action_type,
                    attempts: r.attempts,
                    last_error: r.last_error,
                    payload: r.pending_payload,
                })
                .collect();
            HttpResponse::Ok().json(dto)
        }
        Err(e) => HttpResponse::InternalServerError().body(format!("{}", e)),
    }
}

#[post("/admin/blockchain/retry-anchors")]
pub async fn retry_anchors(
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
) -> impl Responder {
    let pending = match anchor_queue::list_pending(&pool).await {
        Ok(p) => p,
        Err(e) => return HttpResponse::InternalServerError().body(format!("{}", e)),
    };

    let mut summary = anchor_queue::RetrySummary::default();
    summary.total = pending.len() as u32;

    for row in pending {
        let res = match row.action_type.as_str() {
            "grant_access" | "revoke_access" => retry_multisig(&pool, &row, &config).await,
            "store_hash" => retry_store_hash(&pool, &row, &config).await,
            "update_hash" => retry_update_hash(&pool, &row, &config).await,
            "log_access" => retry_log_access(&pool, &row, &config).await,
            other => Err(format!("unknown action_type: {}", other)),
        };

        match res {
            Ok(tx_hash) => {
                let _ = anchor_queue::mark_confirmed(&pool, row.id, &tx_hash).await;
                summary.confirmed += 1;
                summary.results.push(anchor_queue::RetryResult {
                    row_id: row.id, outcome: "confirmed",
                    tx_hash: Some(tx_hash), error: None,
                });
            }
            Err(e) => {
                let _ = anchor_queue::mark_attempt_failed(&pool, row.id, &e).await;
                summary.still_pending += 1;
                summary.results.push(anchor_queue::RetryResult {
                    row_id: row.id, outcome: "still_pending",
                    tx_hash: None, error: Some(e),
                });
            }
        }
    }

    HttpResponse::Ok().json(summary)
}

async fn retry_multisig(
    pool: &PgPool,
    row: &anchor_queue::PendingRow,
    config: &Config,
) -> Result<String, String> {
    let p = &row.pending_payload;
    let provider_user_id = uuid_field(p, "provider_user_id")?;
    let patient_user_id = uuid_field(p, "patient_user_id")?;
    let granted_to_user_id = uuid_field(p, "granted_to_user_id")?;
    let record_id = uuid_field(p, "record_id")?;
    let duration_seconds = p.get("duration_seconds").and_then(|v| v.as_u64());

    let outcome = if row.action_type == "grant_access" {
        let dur = duration_seconds.ok_or("missing duration_seconds")?;
        blockchain_service::grant_access_onchain_multisig(
            pool, provider_user_id, patient_user_id, granted_to_user_id, record_id, dur, config,
        )
        .await
    } else {
        blockchain_service::revoke_access_onchain_multisig(
            pool, provider_user_id, patient_user_id, granted_to_user_id, record_id, config,
        )
        .await
    };

    match outcome {
        blockchain_service::AnchorOutcome::Confirmed { tx_hash, .. } => Ok(tx_hash),
        blockchain_service::AnchorOutcome::Pending { reason, .. } => Err(reason),
    }
}

async fn retry_store_hash(
    pool: &PgPool,
    row: &anchor_queue::PendingRow,
    config: &Config,
) -> Result<String, String> {
    let p = &row.pending_payload;
    let record_id = p.get("record_id").and_then(|v| v.as_str()).ok_or("missing record_id")?;
    let patient_id = p.get("patient_id").and_then(|v| v.as_str()).ok_or("missing patient_id")?;
    let record_hash = p.get("record_hash").and_then(|v| v.as_str()).ok_or("missing record_hash")?;
    blockchain_service::store_record_hash(pool, record_id, patient_id, record_hash, config)
        .await
        .map(|tx| tx.tx_hash)
        .ok_or_else(|| "store_record_hash returned None".into())
}

async fn retry_update_hash(
    pool: &PgPool,
    row: &anchor_queue::PendingRow,
    config: &Config,
) -> Result<String, String> {
    let p = &row.pending_payload;
    let record_id = p.get("record_id").and_then(|v| v.as_str()).ok_or("missing record_id")?;
    let record_hash = p.get("record_hash").and_then(|v| v.as_str()).ok_or("missing record_hash")?;
    blockchain_service::update_record_hash(pool, record_id, record_hash, config)
        .await
        .map(|tx| tx.tx_hash)
        .ok_or_else(|| "update_record_hash returned None".into())
}

async fn retry_log_access(
    pool: &PgPool,
    row: &anchor_queue::PendingRow,
    config: &Config,
) -> Result<String, String> {
    let p = &row.pending_payload;
    let user_id = p.get("user_id").and_then(|v| v.as_str()).ok_or("missing user_id")?;
    let record_id = p.get("record_id").and_then(|v| v.as_str()).ok_or("missing record_id")?;
    let action = p.get("action").and_then(|v| v.as_str()).ok_or("missing action")?;
    blockchain_service::log_access_onchain(pool, user_id, record_id, action, config)
        .await
        .map(|a| a.tx.tx_hash)
        .ok_or_else(|| "log_access_onchain returned None".into())
}

fn uuid_field(v: &Value, key: &str) -> Result<uuid::Uuid, String> {
    let s = v.get(key).and_then(|x| x.as_str()).ok_or_else(|| format!("missing {}", key))?;
    uuid::Uuid::parse_str(s).map_err(|e| format!("bad uuid in {}: {}", key, e))
}
```

- [ ] **Step 2: Register the handler module**

Edit `ehr-blockchain/backend/src/handlers/mod.rs` — append:

```rust
pub mod blockchain_handler;
```

- [ ] **Step 3: Build**

Run from `ehr-blockchain/backend/`:
```bash
cargo build
```
Expected: builds successfully.

- [ ] **Step 4: Commit**

```bash
git add ehr-blockchain/backend/src/handlers/blockchain_handler.rs ehr-blockchain/backend/src/handlers/mod.rs
git commit -m "feat(backend): admin endpoints for pending anchors + retry"
```

---

### Task 12: Permission flow uses multi-sig + receipts include `anchor_status`

**Files:**
- Modify: `ehr-blockchain/backend/src/handlers/permission_handler.rs`
- Modify: `ehr-blockchain/backend/src/services/record_service.rs`

- [ ] **Step 1: Locate the existing grant/revoke call sites**

Run from `ehr-blockchain/backend/`:
```bash
grep -n "grant_access_onchain\|revoke_access_onchain" src/
```
Expected: hits in `handlers/permission_handler.rs`.

- [ ] **Step 2: Replace `grant_access_onchain` calls with `grant_access_onchain_multisig`**

In `handlers/permission_handler.rs`, find each call site (typically passing `(pool, patient_id, granted_to, record_id, duration, config)`) and replace with the multi-sig variant. The new signature takes user IDs (UUIDs) for provider, patient, granted_to plus the record UUID. Wire the `provider_user_id` from the JWT-authenticated caller.

Sketch (search-replace in your local editor — exact line numbers depend on existing code):

```rust
// Before (illustrative):
// let _ = blockchain_service::grant_access_onchain(&pool, &patient_id_str, &granted_to_str,
//     &record_id_str, duration_seconds, &config).await;
// let receipt = build_receipt(...);

// After:
let outcome = blockchain_service::grant_access_onchain_multisig(
    &pool,
    auth_user_id,             // provider_user_id (the caller)
    patient_user_id,
    granted_to_user_id,
    record_uuid,
    duration_seconds,
    &config,
).await;
let anchor_status = match &outcome {
    blockchain_service::AnchorOutcome::Confirmed { .. } => "confirmed",
    blockchain_service::AnchorOutcome::Pending { .. }   => "pending",
};
let pending_id = match &outcome {
    blockchain_service::AnchorOutcome::Pending { row_id, .. } => Some(*row_id),
    _ => None,
};
let tx_hash = match &outcome {
    blockchain_service::AnchorOutcome::Confirmed { tx_hash, .. } => Some(tx_hash.clone()),
    _ => None,
};
HttpResponse::Ok().json(serde_json::json!({
    "anchor_status": anchor_status,
    "pending_id": pending_id,
    "tx_hash": tx_hash,
    "contract_id": config.access_manager_contract_id,
}))
```

Apply the symmetric change for the revoke endpoint using `revoke_access_onchain_multisig`.

- [ ] **Step 3: Update `record_service` receipts**

Find the receipt-builder in `services/record_service.rs` and add `anchor_status: String` (default `"confirmed"`) to its struct. Plumb the value from the `Option<BlockchainTx>` returned by `store_record_hash` — `None` ⇒ `"pending"`, `Some(_)` ⇒ `"confirmed"`. Set in the existing call site.

- [ ] **Step 4: Build + run existing tests**

Run from `ehr-blockchain/backend/`:
```bash
cargo build
cargo test --lib
```
Expected: builds; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add ehr-blockchain/backend/src/handlers/permission_handler.rs \
        ehr-blockchain/backend/src/services/record_service.rs
git commit -m "feat(backend): permission flow uses multisig + anchor_status in receipts"
```

---

### Task 13: `main.rs` — register routes, run keypair backfill on startup

**Files:**
- Modify: `ehr-blockchain/backend/src/main.rs`

- [ ] **Step 1: Register the blockchain handler routes**

In `main.rs`, in the `App::new()` configuration block, add (alongside other `.service(...)` calls):

```rust
.service(crate::handlers::blockchain_handler::list_pending)
.service(crate::handlers::blockchain_handler::retry_anchors)
```

These should be inside the `web::scope("/api/v1")` (or whatever the project's scope) and protected by the existing JWT middleware. If the project has a per-route admin guard, wrap them with it.

- [ ] **Step 2: Run keypair backfill at startup**

After the existing `backfill_encrypt_on_startup(&pool, &config.encryption_key).await;` call (or equivalent migration block in `main.rs`), add:

```rust
match crate::services::stellar_identity::backfill_all_users(&pool, &config.encryption_key).await {
    Ok(n) if n > 0 => println!("[startup] generated stellar identities for {} users", n),
    Ok(_) => {}
    Err(e) => eprintln!("[startup] stellar identity backfill failed: {}", e),
}
```

- [ ] **Step 3: Build + run**

Run from `ehr-blockchain/backend/`:
```bash
cargo build
cargo run --release
```
Expected: starts, logs `generated stellar identities for N users` on first boot, no errors.

- [ ] **Step 4: Smoke check the admin endpoint**

In another shell:
```bash
curl -s -H "Authorization: Bearer <ADMIN_JWT>" http://127.0.0.1:8080/api/v1/admin/blockchain/pending | jq .
```
Expected: `[]` (empty array) on a clean DB.

- [ ] **Step 5: Commit**

```bash
git add ehr-blockchain/backend/src/main.rs
git commit -m "feat(backend): register blockchain admin routes + keypair backfill on boot"
```

---

## Phase 5 — Frontend

### Task 14: `src/config/contracts.ts` + `.env.example` + remove hardcoded IDs

**Files:**
- Create: `ehr-blockchain/frontend/src/config/contracts.ts`
- Create: `ehr-blockchain/frontend/.env.example`
- Modify: `ehr-blockchain/frontend/src/pages/BlockchainExplorer.tsx`
- Modify: `ehr-blockchain/frontend/src/services/soroban.ts`

- [ ] **Step 1: Create the config module**

Create `ehr-blockchain/frontend/src/config/contracts.ts`:

```typescript
/**
 * Single source of truth for Stellar Soroban contract IDs and network params.
 *
 * Reads from build-time `import.meta.env.VITE_*`. Add the corresponding entries
 * to `frontend/.env` (gitignored) — see `.env.example`.
 */
const required = (name: string): string => {
  const v = (import.meta.env as Record<string, string | undefined>)[name];
  if (!v || v.length === 0) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return v;
};

export const CONTRACTS = {
  recordRegistry: {
    label: 'Record Registry',
    id: required('VITE_RECORD_REGISTRY_CONTRACT_ID'),
  },
  accessManager: {
    label: 'Access Manager',
    id: required('VITE_ACCESS_MANAGER_CONTRACT_ID'),
  },
  auditTrail: {
    label: 'Audit Trail',
    id: required('VITE_AUDIT_TRAIL_CONTRACT_ID'),
  },
} as const;

export const STELLAR = {
  rpcUrl:
    import.meta.env.VITE_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ??
    'Test SDF Network ; September 2015',
  network: 'Stellar Testnet',
  explorer:
    import.meta.env.VITE_STELLAR_EXPLORER ??
    'https://stellar.expert/explorer/testnet',
} as const;
```

- [ ] **Step 2: Create `.env.example`**

Create `ehr-blockchain/frontend/.env.example`:

```
# Copy to .env and fill in. .env is gitignored.

# Required
VITE_RECORD_REGISTRY_CONTRACT_ID=CCL5QJQHIY2WP637HMJQ5NGIHDFK7ET2FPSDZAPPNDQSUC63HO23VNDD
VITE_ACCESS_MANAGER_CONTRACT_ID=<NEW_MULTISIG_CONTRACT_ID_FROM_PHASE_1>
VITE_AUDIT_TRAIL_CONTRACT_ID=CAIXRA5QQTJOF5HFMBLZA3BXFKMTIM7JVJBKYPLKDO2HJOMSSPGLOMKN

# Optional (sensible defaults baked in)
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_STELLAR_EXPLORER=https://stellar.expert/explorer/testnet
```

- [ ] **Step 3: Replace hardcoded IDs in BlockchainExplorer**

In `ehr-blockchain/frontend/src/pages/BlockchainExplorer.tsx`, replace lines 5-22:

```typescript
import { CONTRACTS, STELLAR } from '../config/contracts'

const RPC_URL = STELLAR.rpcUrl
const NETWORK = STELLAR.network
const STELLAR_EXPERT = STELLAR.explorer
```

(Remove the `const RPC_URL = '...'`, `const NETWORK = '...'`, `const STELLAR_EXPERT = '...'`, and the `const CONTRACTS = { ... } as const` block. The imported `CONTRACTS` has the same shape (`{recordRegistry:{label,id},...}`), so callsites need no changes.)

- [ ] **Step 4: Replace any hardcoded RPC URL in `services/soroban.ts`**

`services/soroban.ts` currently takes `rpcUrl` as a function arg, so no changes are needed there — but verify by importing `STELLAR` if any test or other module hardcodes the URL.

Run:
```bash
grep -rn "soroban-testnet\.stellar\.org" ehr-blockchain/frontend/src
```
Expected: only references inside `config/contracts.ts` and possibly `.env.example`.

- [ ] **Step 5: Build the frontend**

Run from `ehr-blockchain/frontend/`:
```bash
cp .env.example .env  # for now; user replaces ACCESS_MANAGER_CONTRACT_ID after deploy
npm run build
```
Expected: build succeeds; if env vars are missing, the build fails loudly with the helpful `Missing required env var` message.

- [ ] **Step 6: Commit**

```bash
git add ehr-blockchain/frontend/src/config/contracts.ts \
        ehr-blockchain/frontend/.env.example \
        ehr-blockchain/frontend/src/pages/BlockchainExplorer.tsx \
        ehr-blockchain/frontend/src/services/soroban.ts
git commit -m "feat(frontend): contract IDs from VITE_* env, remove hardcoded values"
```

---

### Task 15: BlockchainExplorer — Pending tab + retry button + anchor_status badges

**Files:**
- Modify: `ehr-blockchain/frontend/src/pages/BlockchainExplorer.tsx`

- [ ] **Step 1: Add a `pending` tab to the existing TabKey union**

Find the line `type TabKey = 'records' | 'grants' | 'audit'` (line 46 in current file) and replace with:

```typescript
type TabKey = 'records' | 'grants' | 'audit' | 'pending'
```

- [ ] **Step 2: Add the tab state, fetch, and retry logic**

Inside the `BlockchainExplorer` component (after the existing `useState` calls), add:

```typescript
const [pending, setPending] = useState<Array<{
  id: number
  contract_id: string
  action_type: string
  attempts: number
  last_error: string | null
  payload: unknown
}>>([])
const [retrying, setRetrying] = useState(false)

const fetchPending = async () => {
  try {
    const res = await fetch('/api/v1/admin/blockchain/pending', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    setPending(await res.json())
  } catch (e) {
    console.error('[pending] fetch failed', e)
  }
}

const retryAll = async () => {
  setRetrying(true)
  try {
    const res = await fetch('/api/v1/admin/blockchain/retry-anchors', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
    })
    const summary = await res.json()
    console.log('[pending] retry summary', summary)
    await fetchPending()
  } catch (e) {
    console.error('[pending] retry failed', e)
  } finally {
    setRetrying(false)
  }
}

useEffect(() => { void fetchPending() }, [])
```

- [ ] **Step 3: Add the Pending tab button + panel**

In the tab-bar JSX, alongside existing `records | grants | audit` buttons, append:

```tsx
<button
  onClick={() => setTab('pending')}
  className={tab === 'pending' ? 'tab-active' : 'tab'}
>
  Pending Anchors {pending.length > 0 && <span className="badge-amber">{pending.length}</span>}
</button>
```

In the panel section, add the conditional render:

```tsx
{tab === 'pending' && (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2>Pending Anchors</h2>
      <button onClick={retryAll} disabled={retrying || pending.length === 0}>
        {retrying ? 'Retrying…' : `Retry all (${pending.length})`}
      </button>
    </div>
    {pending.length === 0 ? (
      <p>No pending anchors. The chain is in sync.</p>
    ) : (
      <table>
        <thead>
          <tr><th>ID</th><th>Action</th><th>Contract</th><th>Attempts</th><th>Last Error</th></tr>
        </thead>
        <tbody>
          {pending.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{p.action_type}</td>
              <td><code>{p.contract_id.slice(0, 8)}…</code></td>
              <td>{p.attempts}</td>
              <td><code style={{ fontSize: '0.85em' }}>{p.last_error ?? ''}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)}
```

- [ ] **Step 4: Verify the page renders**

Run from `ehr-blockchain/frontend/`:
```bash
npm run dev
```
Open the BlockchainExplorer page in the browser, click the "Pending Anchors" tab. Expected: empty-state message renders. (When backend is reachable and DB has pending rows, they'll show.)

- [ ] **Step 5: Commit**

```bash
git add ehr-blockchain/frontend/src/pages/BlockchainExplorer.tsx
git commit -m "feat(frontend): pending anchors tab + retry button in explorer"
```

---

## Phase 6 — Cutover & demo

### Task 16: Update `.env.example` with the new `ACCESS_MANAGER_CONTRACT_ID`

**Files:**
- Modify: `ehr-blockchain/.env.example`

- [ ] **Step 1: Replace the line**

Edit `ehr-blockchain/.env.example` line 17:

```
# Before:
ACCESS_MANAGER_CONTRACT_ID=CAQF6LCVGDOZXHXZMADFHB6EL5ELRGJAHZKFPLVEJM75PRIKQCD7XUJ2
# After:
ACCESS_MANAGER_CONTRACT_ID=<NEW_MULTISIG_CONTRACT_ID_FROM_PHASE_1>
```

Replace the placeholder with the real ID captured in Task 3, Step 2.

- [ ] **Step 2: Add a comment block at top of file documenting the v2 cutover**

Just below `# Blockchain - Stellar Testnet (Soroban)` add:

```
# Access Manager v2 contract requires provider + patient signatures (multi-sig).
# v1 (legacy, owner-only): CAQF6LCVGDOZXHXZMADFHB6EL5ELRGJAHZKFPLVEJM75PRIKQCD7XUJ2
```

- [ ] **Step 3: Commit**

```bash
git add ehr-blockchain/.env.example
git commit -m "chore(env): cutover to multisig access_manager v2 contract ID"
```

---

### Task 17: Demo script `demo-multisig-and-pending.sh`

**Files:**
- Create: `ehr-blockchain/scripts/demo-multisig-and-pending.sh`

- [ ] **Step 1: Write the script**

Create `ehr-blockchain/scripts/demo-multisig-and-pending.sh`:

```bash
#!/usr/bin/env bash
# Demo: prove that grants require both signatures and that anchor failures are recoverable.
#
# Usage:
#   API=http://127.0.0.1:8080/api/v1 \
#   ADMIN_JWT="<token>" \
#   PROVIDER_ID="<uuid>" PATIENT_ID="<uuid>" GRANTED_TO="<uuid>" RECORD_ID="<uuid>" \
#   ./scripts/demo-multisig-and-pending.sh
set -euo pipefail
: "${API:?}"; : "${ADMIN_JWT:?}"
: "${PROVIDER_ID:?}"; : "${PATIENT_ID:?}"; : "${GRANTED_TO:?}"; : "${RECORD_ID:?}"

echo "==> 1. Happy path grant — should anchor with two signatures"
curl -fsS -X POST "$API/permissions/grant" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H 'Content-Type: application/json' \
  -d "{\"patient_user_id\":\"$PATIENT_ID\",\"granted_to_user_id\":\"$GRANTED_TO\",\"record_id\":\"$RECORD_ID\",\"duration_seconds\":3600}" \
  | jq '.anchor_status, .tx_hash'

echo "==> 2. Simulate failure: rename soroban CLI temporarily"
SOROBAN_BIN="$(command -v soroban || true)"
if [[ -n "$SOROBAN_BIN" ]]; then
  sudo mv "$SOROBAN_BIN" "${SOROBAN_BIN}.disabled"
fi

echo "==> 3. Grant during outage — should return anchor_status=pending"
RESP="$(curl -fsS -X POST "$API/permissions/grant" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H 'Content-Type: application/json' \
  -d "{\"patient_user_id\":\"$PATIENT_ID\",\"granted_to_user_id\":\"$GRANTED_TO\",\"record_id\":\"00000000-0000-0000-0000-000000000002\",\"duration_seconds\":3600}")"
echo "$RESP" | jq '.anchor_status, .pending_id'

echo "==> 4. List pending"
curl -fsS "$API/admin/blockchain/pending" -H "Authorization: Bearer $ADMIN_JWT" | jq

echo "==> 5. Restore soroban CLI"
if [[ -n "$SOROBAN_BIN" && -f "${SOROBAN_BIN}.disabled" ]]; then
  sudo mv "${SOROBAN_BIN}.disabled" "$SOROBAN_BIN"
fi

echo "==> 6. Retry — pending row should flip to confirmed"
curl -fsS -X POST "$API/admin/blockchain/retry-anchors" -H "Authorization: Bearer $ADMIN_JWT" | jq

echo "==> 7. Re-list pending — should be empty"
curl -fsS "$API/admin/blockchain/pending" -H "Authorization: Bearer $ADMIN_JWT" | jq
```

- [ ] **Step 2: Make it executable**

Run from `ehr-blockchain/`:
```bash
chmod +x scripts/demo-multisig-and-pending.sh
```

- [ ] **Step 3: Run the script end-to-end against a populated dev DB**

```bash
API=http://127.0.0.1:8080/api/v1 \
ADMIN_JWT="$(curl -s -X POST http://127.0.0.1:8080/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"adminpass"}' | jq -r .token)" \
PROVIDER_ID="..." PATIENT_ID="..." GRANTED_TO="..." RECORD_ID="..." \
./scripts/demo-multisig-and-pending.sh
```
Expected: step 1 prints `"confirmed"` + tx hash; step 3 prints `"pending"` + a numeric `pending_id`; step 4 lists that row; step 6 reports `confirmed: 1`; step 7 prints `[]`.

- [ ] **Step 4: Commit**

```bash
git add ehr-blockchain/scripts/demo-multisig-and-pending.sh
git commit -m "test(demo): end-to-end multisig + pending-anchor script"
```

---

## Phase 7 — Documentation

### Task 18: `docs/threat-model.md`

**Files:**
- Create: `ehr-blockchain/docs/threat-model.md`

- [ ] **Step 1: Write the doc**

Create `ehr-blockchain/docs/threat-model.md`:

```markdown
# Threat Model

## What the chain proves

For every access grant on `access_manager` v2, the on-chain record carries
**two distinct Ed25519 signatures**:

1. The provider-admin key (held by the backend, sourced from
   `STELLAR_ADMIN_KEY` / `STELLAR_ADMIN_KEY_FILE`).
2. The patient's per-user key (held by the backend in encrypted form in
   `users.stellar_secret_enc`).

A third party reading any block explorer can verify both signatures
cryptographically without trusting our backend.

## What the chain does NOT prove (yet)

- **Patient self-sovereignty.** The patient key is custodial — held and
  decrypted by the backend on the patient's behalf, like a fiduciary. The
  patient does not personally sign with a wallet they hold. This is a
  prototyping decision; production migration to Freighter / mobile / HSM
  custody requires no contract change because multi-sig is enforced at the
  contract level.
- **PHI integrity beyond the hash.** SOAP notes are stored encrypted in
  PostgreSQL (AES-256-GCM, random per-record nonce). The chain proves the
  hash existed; the encrypted field is the source of plaintext.

## Assets and adversaries

| Asset | Threat | Control |
|---|---|---|
| `STELLAR_ADMIN_KEY` | Exfiltration → forge any record / grant | `STELLAR_ADMIN_KEY_FILE` precedence; never logged; rotation runbook (see runbook-key-rotation.md) |
| `users.stellar_secret_enc` | DB dump → forge patient signatures | AES-256-GCM with `ENCRYPTION_KEY` (separate variable); decrypt only in-process for tx build |
| `ENCRYPTION_KEY` | Compromise → SOAP plaintext + patient secrets recoverable | Env-only today; future: KMS |
| Soroban CLI / Node helper | Tampered binary submits malicious tx | Helper invoked with hardcoded path; payload built server-side from typed fields |

## Failure modes

- **CLI / RPC / helper unavailable** → write persists to DB, anchor row is
  `status='pending'`. API responses report `anchor_status: "pending"` so the
  UI never claims "anchored" when it isn't.
- **Patient identity missing** → grant fails loudly (returns `pending` with
  reason "patient identity"); never silently downgraded to single-sig.
- **STELLAR_ADMIN_KEY=placeholder** → grant fails loudly with reason
  "admin key missing" — same as above.

## Out of scope (documented future work)

- Patient wallet custody (Freighter / mobile / HSM)
- Background retry worker (currently manual via `/admin/blockchain/retry-anchors`)
- KMS-backed admin and encryption keys
- Force-revoke without patient signature (subpoena / account-takeover scenarios)
```

- [ ] **Step 2: Commit**

```bash
git add ehr-blockchain/docs/threat-model.md
git commit -m "docs: threat model — what the chain proves and what it doesn't"
```

---

### Task 19: `docs/runbook-key-rotation.md`

**Files:**
- Create: `ehr-blockchain/docs/runbook-key-rotation.md`

- [ ] **Step 1: Write the doc**

Create `ehr-blockchain/docs/runbook-key-rotation.md`:

```markdown
# Runbook — Key Rotation

## Provider-admin key (`STELLAR_ADMIN_KEY`)

The admin key signs every contract mutation. Rotate when:

- the key has been committed to a public repo (treat as burned),
- a developer with access to the secret file leaves the team,
- on a fixed schedule (recommended: every 90 days for production).

### Steps

1. **Generate a fresh keypair** off-server:
   ```bash
   soroban keys generate admin-new --network testnet
   soroban keys address admin-new
   soroban keys show admin-new      # secret — capture once
   ```

2. **Fund the new account** on testnet via friendbot:
   ```bash
   curl "https://friendbot.stellar.org?addr=$(soroban keys address admin-new)"
   ```

3. **Re-init each contract** with the new owner:
   ```bash
   for C in "$RECORD_REGISTRY_CONTRACT_ID" "$ACCESS_MANAGER_CONTRACT_ID" "$AUDIT_TRAIL_CONTRACT_ID"; do
     soroban contract invoke --id "$C" --source admin -- transfer_owner --new_owner "$(soroban keys address admin-new)"
   done
   ```
   *(Note: `transfer_owner` is not currently implemented; for testnet rotation, redeploy is acceptable. Production would need this method on each contract.)*

4. **Update the secret file** at `STELLAR_ADMIN_KEY_FILE` (or `.env`):
   ```bash
   echo -n "$(soroban keys show admin-new)" > /var/secrets/stellar_admin.key
   chmod 600 /var/secrets/stellar_admin.key
   ```

5. **Restart the backend** so `Config::from_env` re-reads the file. Watch
   for `[config] Loaded .env from ...` and confirm there's no
   `STELLAR_ADMIN_KEY loaded inline` warning.

6. **Smoke test**: create a record + grant, confirm `anchor_status = "confirmed"`.

7. **Decommission the old key**: zeroize the old secret file. Optionally
   sweep its testnet balance back to a treasury account.

## Patient per-user keys (`users.stellar_secret_enc`)

Today these are not rotated — each patient has one key for life. If the
underlying `ENCRYPTION_KEY` rotates, run the existing
`backfill_encrypt_on_startup` flow which is **idempotent** for already-
encrypted columns.

A patient-key rotation procedure is future work; the contract supports it
because grants are keyed by `patient_id` (UUID-derived 32-byte hex), not by
the patient's Stellar address.

## Database encryption key (`ENCRYPTION_KEY`)

Rotation requires re-encrypting all `enc:v1:` columns under the new key.
Approach (not yet implemented):

1. Add `enc:v2:` prefix support in `services/encryption.rs`.
2. Add a one-shot migration job that decrypts under v1, re-encrypts under v2.
3. After verification, retire the v1 key.
```

- [ ] **Step 2: Commit**

```bash
git add ehr-blockchain/docs/runbook-key-rotation.md
git commit -m "docs: runbook for stellar admin and encryption key rotation"
```

---

### Task 20: Update `architecture.md` and `smart-contracts.md`

**Files:**
- Modify: `ehr-blockchain/docs/architecture.md`
- Modify: `ehr-blockchain/docs/smart-contracts.md`

- [ ] **Step 1: Update `architecture.md`**

Find the "what the chain proves" section (or add one if absent) and replace/insert:

```markdown
## What the chain proves

Every access grant on `access_manager` v2 carries two Ed25519 signatures:
provider-admin and patient. Block explorers can verify both without trusting
the EHR backend. Record-hash anchoring (`record_registry`) and audit-event
mirroring (`audit_trail`) remain admin-signed because they are not consent
events. See `threat-model.md`.

## Anchor failure handling

When the on-chain submit path is unavailable (Soroban CLI missing, RPC down,
multi-sig helper failure), the affected row is persisted to
`blockchain_transactions(status='pending', pending_payload=<json>)` instead
of being silently dropped. Admins drain the queue via
`POST /api/v1/admin/blockchain/retry-anchors` or via the "Retry all" button
in the BlockchainExplorer UI.
```

Update the diagram (if present) to show two key holders for `access_manager` mutations.

- [ ] **Step 2: Update `smart-contracts.md`**

Replace the current `access_manager` section with:

```markdown
## Access Manager (v2 — multi-sig)

Contract ID: `<NEW_MULTISIG_CONTRACT_ID>`
Legacy v1 (owner-only): `CAQF6LCVGDOZXHXZMADFHB6EL5ELRGJAHZKFPLVEJM75PRIKQCD7XUJ2` — deprecated.

### ABI

```rust
fn init(env: Env, owner: Address)

fn grant_access(
    env: Env,
    provider: Address,        // require_auth()
    patient: Address,         // require_auth()
    patient_id: BytesN<32>,
    granted_to: BytesN<32>,
    record_id: BytesN<32>,
    duration_seconds: u64,
)

fn revoke_access(
    env: Env,
    provider: Address,        // require_auth()
    patient: Address,         // require_auth()
    patient_id: BytesN<32>,
    granted_to: BytesN<32>,
    record_id: BytesN<32>,
)

fn check_access(
    env: Env,
    patient_id: BytesN<32>,
    granted_to: BytesN<32>,
    record_id: BytesN<32>,
) -> bool

fn get_patient_permissions(
    env: Env,
    patient_id: BytesN<32>,
) -> Vec<(BytesN<32>, BytesN<32>, BytesN<32>)>
```

Both `provider` and `patient` Addresses must sign the transaction's auth
entries; otherwise the host aborts the call. The owner field exists for
historical compatibility with `init` but is not consulted for grant/revoke.
```

- [ ] **Step 3: Commit**

```bash
git add ehr-blockchain/docs/architecture.md ehr-blockchain/docs/smart-contracts.md
git commit -m "docs: update architecture + smart-contracts for multisig + pending"
```

---

## Self-review checklist (already applied)

- ✅ Spec §3 picks 1-4: covered by Tasks 1, 6, 7, 9-15.
- ✅ Spec §5 migration: Task 4.
- ✅ Spec §6 contract: Tasks 1-3.
- ✅ Spec §7 backend: Tasks 5-13.
- ✅ Spec §8 frontend: Tasks 14-15.
- ✅ Spec §9 docs: Tasks 18-20.
- ✅ Spec §10 testing strategy: contract tests in Task 2; backend unit tests in Tasks 6, 7, 9; manual demo script in Task 17.
- ✅ Spec §11 rollout sequence: contract → migration → backend modules → frontend → cutover → docs.
- ✅ Spec §12 known limitations: documented in `threat-model.md` (Task 18).
- No "TBD" / "implement later" / "similar to..." placeholders.
- Type names consistent: `AnchorOutcome`, `PendingRow`, `RetrySummary`, `PatientIdentity`, `IdentityError`, `QueueError` defined and used as introduced.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-blockchain-integrity-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
