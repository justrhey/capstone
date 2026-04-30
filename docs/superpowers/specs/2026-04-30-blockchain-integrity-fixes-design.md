# Blockchain Integrity Fixes — Design

Date: 2026-04-30
Scope: ehr-blockchain (smart contracts, Rust backend, React frontend)
Status: Approved (brainstorm) — pending spec sign-off before plan-writing.

## 1. Problem

The party-mode code review surfaced two structural weaknesses in the on-chain story:

1. **Single-signer model.** All three Soroban contracts gate every mutation behind a single `owner.require_auth()` — i.e. one provider-admin key. The chain therefore proves "the admin recorded this", not "the patient consented." For an EHR audit-trail claim, that's the wrong cryptographic guarantee.
2. **Silent anchor failure.** `services/blockchain_service.rs::run_soroban` returns `None` whenever the soroban CLI is missing or the RPC fails. Callers treat `None` as a non-event — the record is still saved to PostgreSQL with no indication that on-chain anchoring did not happen. The system can quietly stop being a blockchain system.

Secondary findings:

- Frontend hardcodes contract IDs in `BlockchainExplorer.tsx`; redeploys ship stale IDs.
- No documented threat model or admin-key rotation runbook.

## 2. Goals

For the capstone defense:

- The on-chain audit trail must show **two distinct signatures** for every access grant — provider and patient — verifiable in any Stellar block explorer.
- Anchor failures must be **honest and recoverable**: persisted to the DB as `pending`, surfaced to the user, and retryable on demand.
- The frontend must read contract IDs from build-time env so redeploys don't drift.
- The trust model — what the chain proves vs. what it relies on the backend for — must be written down.

Non-goals (documented future work):

- Freighter / mobile / HSM patient-key custody.
- Background retry worker.
- KMS-backed admin key.

## 3. Design picks (from brainstorm)

| # | Decision | Rationale |
|---|---|---|
| 1 | Patient keypair is generated at signup and stored AES-256-GCM-encrypted in `users.stellar_secret_enc` (plus public `users.stellar_pubkey`) | Reuses existing encryption infra. No wallet UI. Each patient has a distinct on-chain identity. |
| 2 | `access_manager.grant_access` / `revoke_access` take `provider: Address` + `patient: Address` and call `require_auth()` on both | Idiomatic Soroban native multi-auth. Cryptographically enforced by the network, not the application. |
| 3 | `blockchain_transactions` gains `status`, `attempts`, `last_error`, `pending_payload` columns. Failure path inserts `pending`. New `POST /admin/blockchain/retry-anchors` drains pending rows on demand | Persistent, demo-friendly (manual retry button), no extra binary. |
| 4 | Multi-sig is always required — no feature flag | Single mode = simpler defense story. Backend always has both keys. |

## 4. Architecture

```
                                 (current)                        (new)
record write             provider-admin sigs                provider-admin sigs       (unchanged)
access grant             provider-admin sigs        →       provider-admin + patient sigs
access revoke            provider-admin sigs        →       provider-admin + patient sigs
audit log                provider-admin sigs                provider-admin sigs       (unchanged)
anchor failure           silent (None)              →       DB row status='pending', retry endpoint
patient identity         none                       →       per-patient Stellar address (custodial)
```

Boundaries:

- **`smart-contracts/access_manager`** — only the access-control contract gains multi-auth. Record Registry (hash anchoring) and Audit Trail (event log) stay admin-only because they are not consent events.
- **`backend/services/stellar_identity.rs`** *(new)* — pure module that generates / loads / decrypts patient keypairs. Knows nothing about contracts.
- **`backend/services/blockchain_service.rs`** — gains a multi-sig path that uses the `stellar-sdk` Rust crate (not the CLI) for `grant_access` / `revoke_access`. The CLI path remains for `store_hash`, `update_hash`, `verify_latest`, `log_access`.
- **`backend/services/anchor_queue.rs`** *(new)* — pure module that knows how to insert a pending anchor and how to retry one given its `pending_payload`.
- **`backend/handlers/blockchain_handler.rs`** *(new)* — `POST /admin/blockchain/retry-anchors`, RBAC gate = admin role.
- **`frontend/src/config/contracts.ts`** *(new)* — single source of truth for contract IDs read from `import.meta.env.VITE_*`.

## 5. Data model changes

**Migration `033_multi_sig_and_pending_anchors.sql`:**

```sql
ALTER TABLE users
  ADD COLUMN stellar_pubkey TEXT,                  -- "G..." Stellar address
  ADD COLUMN stellar_secret_enc TEXT;              -- enc:v1:<hex> via existing encryption.rs

ALTER TABLE blockchain_transactions
  ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending','confirmed','failed')),
  ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_error TEXT,
  ADD COLUMN pending_payload JSONB,                -- soroban CLI args or stellar-sdk tx params
  ADD COLUMN next_retry_at TIMESTAMPTZ;

CREATE INDEX idx_blockchain_tx_status_pending
  ON blockchain_transactions (status, next_retry_at)
  WHERE status = 'pending';
```

**Backfill at startup**: for each existing user without `stellar_pubkey`, generate a keypair, encrypt the secret, write both columns. Idempotent (skips users already populated).

## 6. Contract changes

**`access_manager/src/lib.rs`:**

```rust
pub fn grant_access(
    env: Env,
    provider: Address,                  // NEW — required signer
    patient: Address,                   // NEW — required signer
    patient_id: BytesN<32>,
    granted_to: BytesN<32>,
    record_id: BytesN<32>,
    duration_seconds: u64,
) {
    provider.require_auth();
    patient.require_auth();
    // ... existing storage logic unchanged ...
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
    // ... existing storage logic unchanged ...
}
```

`init` and `check_access` unchanged. Owner field deprecated for these two methods (kept for backward compat / other future methods).

**Tests added:**

- `grant_access_succeeds_with_both_signatures` — uses `Env::default()` with `mock_auths` registering both addresses; passes.
- `grant_access_fails_without_patient_auth` — only provider in `mock_auths`; expects panic.
- `revoke_access_*` — symmetric.

**Deployment:** new contract ID. Old `access_manager` becomes legacy; record in docs. `.env.example` updated. No data migration on-chain — start fresh in the new contract.

## 7. Backend changes

### 7.1 `services/stellar_identity.rs` (new)

```rust
pub struct PatientIdentity { pub pubkey: String, pub keypair: Keypair }

pub fn generate_for_user(...) -> Result<PatientIdentity, Error>
pub fn load_for_user(pool: &PgPool, user_id: Uuid, key_hex: &str)
    -> Result<PatientIdentity, Error>
pub async fn ensure_for_user(pool: &PgPool, user_id: Uuid, key_hex: &str)
    -> Result<PatientIdentity, Error>  // generates+stores if missing
pub async fn backfill_all_users(pool: &PgPool, key_hex: &str) -> Result<u64, Error>
```

Uses `stellar-strkey` for "G..." encoding and the `stellar-sdk` `Keypair`. The decrypted secret is held in `Keypair` only for the duration of one tx-build, never logged.

### 7.2 `services/blockchain_service.rs`

New path for multi-sig:

```rust
pub async fn grant_access_onchain_multisig(
    pool: &PgPool,
    provider_id: Uuid,
    patient_id: Uuid,
    granted_to_id: Uuid,
    record_id: Uuid,
    duration_seconds: u64,
    config: &Config,
) -> Result<AnchorOutcome, Error>
```

`AnchorOutcome` = `Confirmed { tx_hash } | Pending { row_id, reason }`.

Internals:
1. Load provider admin keypair (env), patient keypair via `stellar_identity::load_for_user`.
2. Build `InvokeContractOperation` against `access_manager` with both addresses as args.
3. Sign auth entries for both keys with `stellar-sdk::TransactionBuilder`.
4. Submit via `soroban_rpc::Client`. On RPC error or contract error, route to `anchor_queue::enqueue_pending`.
5. Insert into `blockchain_transactions` with `status='confirmed'` or `status='pending'`.

CLI-based paths (`store_record_hash`, `update_record_hash`, `log_access_onchain`) get the same pending treatment: when `run_soroban` returns `None`, call `anchor_queue::enqueue_pending` with the original args serialized to JSON instead of returning `None` silently.

### 7.3 `services/anchor_queue.rs` (new)

```rust
pub async fn enqueue_pending(
    pool: &PgPool,
    contract_id: &str,
    action: &str,
    payload: serde_json::Value,
    last_error: &str,
) -> Result<i64, sqlx::Error>

pub async fn retry_one(pool: &PgPool, row_id: i64, config: &Config)
    -> Result<RetryResult, Error>

pub async fn retry_all_pending(pool: &PgPool, config: &Config)
    -> Result<RetrySummary, Error>
```

`retry_one` reads the row, dispatches by `action_type` to the right blockchain_service function, increments `attempts`, updates `status`/`last_error`/`tx_hash` accordingly.

### 7.4 `handlers/blockchain_handler.rs` (new)

- `POST /admin/blockchain/retry-anchors` — RBAC: `admin`. Returns `RetrySummary { total, confirmed, still_pending, failed }`.
- `GET /admin/blockchain/pending` — RBAC: `admin`. Returns list for the UI.

### 7.5 `services/record_service.rs` and consent/permission flows

Update receipt builders to include `anchor_status` in the response body. The HTTP status code does **not** change — the record is created either way (201 / 200 stays). The body carries `anchor_status: "pending" | "confirmed"` and, when pending, a `pending_id` the UI uses for the retry poll. This keeps anchor state separate from resource state.

## 8. Frontend changes

### 8.1 `src/config/contracts.ts` (new)

```ts
export const CONTRACTS = {
  recordRegistry: import.meta.env.VITE_RECORD_REGISTRY_CONTRACT_ID,
  accessManager:  import.meta.env.VITE_ACCESS_MANAGER_CONTRACT_ID,
  auditTrail:     import.meta.env.VITE_AUDIT_TRAIL_CONTRACT_ID,
  rpcUrl:         import.meta.env.VITE_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE
                     ?? "Test SDF Network ; September 2015",
};
```

`BlockchainExplorer.tsx` and `services/soroban.ts` import from here; existing constants removed.

### 8.2 BlockchainExplorer additions

- New tab "Pending Anchors" — table of pending rows from `GET /admin/blockchain/pending` (admin only).
- "Retry all" button → `POST /admin/blockchain/retry-anchors`.
- Receipt panel surfaces `anchor_status` badge: green `confirmed` / amber `pending`.

### 8.3 `.env.example` for frontend

```
VITE_RECORD_REGISTRY_CONTRACT_ID=...
VITE_ACCESS_MANAGER_CONTRACT_ID=...           # NEW deployed multisig contract
VITE_AUDIT_TRAIL_CONTRACT_ID=...
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

## 9. Documentation

- **`docs/threat-model.md`** — what the chain proves (two-sig consent), what it relies on the backend for (custodial fiduciary key), failure modes, future migration to wallet-held patient keys.
- **`docs/runbook-key-rotation.md`** — steps to rotate the provider-admin key (deploy-and-init replacement contract, dual-write window, env swap, decommission). Even if not exercised, the runbook is a defense artifact.
- **`docs/architecture.md`** — update the diagram and the "what the chain proves" sentence.
- **`docs/smart-contracts.md`** — add the new `access_manager` ABI; mark the legacy contract.

## 10. Testing strategy

- **Contract tests** (Rust, in-tree): two-sig success, single-sig failure (expects panic), revoke parity, expiry semantics unchanged.
- **Backend unit tests**: `stellar_identity` keypair roundtrip; `anchor_queue::enqueue_pending` schema; `retry_one` happy path with mocked submitter; receipt builder includes `anchor_status`.
- **Backend integration test** (gated `#[ignore]` unless `SOROBAN_AVAILABLE=1`): real CLI invocation against testnet, asserts confirmed.
- **Manual demo script** (`scripts/demo-multisig-and-pending.sh`): creates a grant (asserts two sigs in the explorer JSON), simulates failure (rename `soroban` binary), creates another grant (asserts pending row), restores binary, hits retry endpoint, asserts confirmed.

## 11. Rollout

1. Deploy new `access_manager` to testnet, capture contract ID.
2. Run migration `033`.
3. Backfill existing users' keypairs at startup.
4. Update backend & frontend env files.
5. Smoke test the demo script.
6. Update docs.

No production data, so no need for blue/green or dual-write.

## 12. Open questions / known limitations

- Patient keypair is custodial — call this out plainly in the threat model.
- `revoke_access` in this design also requires patient signature; if a provider needs to unilaterally revoke for safety reasons (subpoena, account takeover), the design currently does not allow that. Documented as future work: add `force_revoke(provider_only)` with a separate audit symbol.
- The retry endpoint is admin-only; the queue is unbounded. Acceptable for capstone scale; production would need rate-limiting and TTL.
- Some `users` may not be patients (clinicians, admins). **Decision: keypair generation runs for *all* user roles**, on the grounds that (a) the row size is trivial, (b) future flows (prescriber attestations, second-clinician sign-offs) may want a per-user signing key, and (c) the backfill becomes a single `WHERE stellar_pubkey IS NULL` query with no role filter. §5 and §7.1 reflect this; the `users.role` column is not consulted by `stellar_identity::backfill_all_users`.
