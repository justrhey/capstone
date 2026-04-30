# Smart Contract Design

Three Soroban contracts on Stellar Testnet. Record Registry and Audit Trail are admin-signed (`owner.require_auth()`). Access Manager v2 is multi-sig — `grant_access` and `revoke_access` require both `provider.require_auth()` *and* `patient.require_auth()` in the same transaction.

| Contract | ID (Testnet) | Purpose |
|---|---|---|
| Record Registry | `CCL5QJQHIY2WP637HMJQ5NGIHDFK7ET2FPSDZAPPNDQSUC63HO23VNDD` | Store and attest SHA-256 record hashes (versioned) |
| Access Manager (v2 multi-sig) | `<deploy v2 and replace>` — see runbook | Time-bound access grants requiring patient + provider signatures |
| Access Manager (v1, legacy) | `CAQF6LCVGDOZXHXZMADFHB6EL5ELRGJAHZKFPLVEJM75PRIKQCD7XUJ2` | Owner-only — deprecated, retained for historical reads |
| Audit Trail | `CAIXRA5QQTJOF5HFMBLZA3BXFKMTIM7JVJBKYPLKDO2HJOMSSPGLOMKN` | Immutable per-record access event log |

Source: `smart-contracts/{record_registry,access_manager,audit_trail}/src/lib.rs`

---

## 1. Record Registry

### 1.1 Purpose
Notarize every medical record. Backend computes `SHA-256(diagnosis|treatment|notes)` over plaintext at creation time and stores it on-chain. The hash is public; the plaintext is not.

### 1.2 Storage
```rust
struct RecordHash {
    patient_id: BytesN<32>,
    record_hash: BytesN<32>,
    timestamp: u64,
}

enum DataKey {
    Record(BytesN<32>),            // record_hash -> RecordHash
    PatientRecords(BytesN<32>),    // patient_id  -> Vec<record_hash>
    Owner,
}
```

### 1.3 Methods
| Method | Auth | Behavior |
|---|---|---|
| `init(owner)` | once | Sets admin Address |
| `store_hash(patient_id, record_hash) -> timestamp` | admin | Writes `RecordHash`, appends to `PatientRecords(patient_id)`, returns ledger timestamp |
| `verify_hash(record_hash) -> bool` | public | `true` iff the hash key exists in `Record` map |
| `get_patient_records(patient_id) -> Vec<BytesN<32>>` | public | All hashes anchored for a patient |

### 1.4 Invariants (current)
- Timestamp source: `env.ledger().timestamp()` (trusted).
- No uniqueness check on `record_hash`; duplicate calls silently overwrite.
- No removal method; data is append-only with no expiry.

### 1.5 Known limitations (from thesis review)
1. **Overwrite on update.** The backend calls `store_hash` again after edits, so a rogue backend can substitute a tampered hash without on-chain evidence of the prior value.
2. **No versioning / tombstones.** There is no on-chain linkage between old and new hashes for the same record id.
3. **No independent-verify affordance.** A patient cannot re-compute the hash without plaintext, and nothing on-chain associates `record_hash` with a stable `record_id`.

### 1.6 Proposed v2 design
```rust
enum RecordEntry {
    Active(RecordHash, u64 /* version */),
    Tombstoned(RecordHash, u64 /* replaced_by */),
}

// Keyed by (record_id, version) — store_hash rejects overwrite at same version.
store_hash(record_id, version, record_hash)   // requires version = latest + 1
mark_tombstoned(record_id, version, replaced_by)
```
This makes every edit visible on-chain as a new version with a pointer to the superseded one.

---

## 2. Access Manager (v2 — multi-sig)

### 2.1 Purpose
Record time-bound access grants from patients to staff with **cryptographic
proof of patient consent**. Both the provider and the patient must sign
every grant and every revoke.

### 2.2 Storage
```rust
struct Permission {
    patient_id: BytesN<32>,
    granted_to: BytesN<32>,
    record_id: BytesN<32>,
    granted_at: u64,
    expires_at: u64,
    active: bool,
}

enum DataKey {
    Permission(patient_id, granted_to, record_id),
    PatientPermissions(patient_id),
    Owner,
}
```

### 2.3 Methods (v2 ABI)
| Method | Auth | Behavior |
|---|---|---|
| `init(owner)` | once | Sets admin Address (used only for legacy compatibility; not consulted on grant/revoke) |
| `grant_access(provider, patient, patient_id, granted_to, record_id, duration)` | `provider.require_auth() && patient.require_auth()` | Creates Permission; expiry = now + duration. Both signatures required at the host level. |
| `revoke_access(provider, patient, patient_id, granted_to, record_id)` | `provider.require_auth() && patient.require_auth()` | Sets `active = false`. Both signatures required. |
| `check_access(patient_id, granted_to, record_id) -> bool` | public | `active && now <= expires_at` |
| `get_patient_permissions(patient_id) -> Vec<(…)>` | public | All keys the patient has granted |

### 2.4 What v2 changes vs. v1

- **v1 (legacy, deployed at `CAQF6LCVGDOZXHXZMADFHB6EL5ELRGJAHZKFPLVEJM75PRIKQCD7XUJ2`):** `grant_access` and `revoke_access` only required `owner.require_auth()`. The chain proved "the admin recorded a grant," not "the patient consented."
- **v2 (current source at `smart-contracts/access_manager/src/lib.rs`):** both signatures required. A leaked admin key alone cannot forge a patient consent — see `docs/threat-model.md`.

The v1 contract instance remains on testnet for historical reads; new
grants and revokes go to the v2 deployment. The cutover step (capturing the
v2 contract ID and updating env files) is documented in
`docs/superpowers/plans/2026-04-30-blockchain-integrity-fixes.md` Tasks 3
and 16.

### 2.5 Tests

Six unit tests live in `smart-contracts/access_manager/src/lib.rs` test
module:

- `grant_access_persists_patient_permissions_vector` (regression — guards
  the `BI-2` Vec-not-persisted bug discovered during prior review and now
  fixed)
- `grant_and_check_access_within_expiry`
- `revoke_access_flips_active_flag`
- `grant_access_succeeds_with_both_signatures`
- `grant_access_fails_without_patient_auth` (`#[should_panic]`)
- `revoke_access_fails_without_patient_auth` (`#[should_panic]`)

Run with `cargo test` from `smart-contracts/access_manager/`.

---

## 3. Audit Trail

### 3.1 Purpose
Immutable per-record access log. Every sensitive mutation on a medical record is mirrored here.

### 3.2 Storage
```rust
struct AuditEntry {
    user_id: BytesN<32>,
    record_id: BytesN<32>,
    action: Symbol,
    timestamp: u64,
}

enum DataKey {
    AuditLog(record_id, sequence),
    RecordAuditCount(record_id),
    Owner,
}
```

Entries are indexed sequentially per record; `RecordAuditCount` holds the next slot.

### 3.3 Methods
| Method | Auth | Behavior |
|---|---|---|
| `init(owner)` | once | Sets admin Address |
| `log_access(user_id, record_id, action) -> (ledger_timestamp, sequence)` | admin | Writes entry at next sequence; returns the **ledger timestamp** (authoritative) alongside the per-record sequence |
| `get_audit_log(record_id) -> Vec<AuditEntry>` | public | All entries for a record; each entry carries its ledger timestamp |

### 3.4 Invariants
- Append-only. `log_access` can never overwrite a prior entry — `sequence = count` is strictly monotonic.
- `get_audit_log` iterates `0..count` and returns all entries.
- Every entry's `timestamp` field equals the ledger timestamp at the moment `log_access` was invoked. This is returned by the call itself so the backend can persist it alongside the DB row.

### 3.5 Timestamp policy (BI-7)

**Ledger time is authoritative.** Whenever an audit event is successfully
mirrored on-chain, the ledger timestamp (`env.ledger().timestamp()`) is the
source-of-truth "when" for that event. The DB `created_at` column is an
advisory-only fallback used when the on-chain mirror is unavailable (e.g.
`soroban` CLI not installed, RPC unreachable).

Rationale: a compromised backend can backdate `created_at`, but it cannot
alter an already-issued ledger timestamp. When a dispute arises about when
something happened, the audit reader should resolve it with the formula:

```
authoritative_timestamp =
    blockchain_timestamp  IF present and > 0
    ELSE                    created_at (flagged "db-only")
```

Implemented in `services/audit_service.rs::authoritative_timestamp`.
Persisted in `audit_logs.blockchain_timestamp` (unix seconds) and
`audit_logs.blockchain_sequence` (per-record counter) via migration 015.

Unit tests in `services/audit_service.rs::tests` assert that ledger time
wins over DB time even when they differ significantly.

### 3.5 Known limitations
1. **Mirror-only.** Backend already allowed the access before calling the contract; the contract cannot prevent unauthorized reads.
2. **Only `medical_record` events are mirrored.** Patient mutations, permission changes, user mutations are DB-only.
3. **Action is a `Symbol`** (max 32 bytes). Current mirror only fires for `resource_type == "medical_record"`.

### 3.6 Proposed v2 design
- Mirror all `audit_service::log_action` calls regardless of resource type.
- Add a `read_access` event mirrored on every SELECT of a record (requires backend instrumentation, cost tradeoff).
- Expose `get_audit_log(user_id)` to answer patient queries like "who accessed my records."

---

## 4. Deployment & initialization

Per contract, once at deploy time:

```bash
soroban contract deploy --wasm <path>.wasm --source admin --network testnet
# → prints contract ID
soroban contract invoke --id <C…> --source admin --network testnet -- init --owner $(soroban keys address admin)
```

Subsequent calls (`store_hash`, `grant_access`, `log_access`) require the same `admin` source because of `owner.require_auth()`.

For rotation, see `docs/stellar-admin-rotation.md`.

---

## 5. Gas and storage economics

Testnet is free. Real deployment considerations:

- **Record Registry** grows `O(records)` in `PatientRecords` vectors. A patient with 10k records means a 10k-entry vector fetched on `get_patient_records` — rethink pagination at deploy time.
- **Audit Trail** grows `O(events × records)`. Consider TTL-backed `env.storage().temporary()` for reads, persistent only for mutations.
- **Access Manager** is bounded by active grants; cleanup of expired/revoked entries not implemented.

Soroban persistent storage has rent; the contract should be designed to extend TTL on hot keys or rely on temporary storage for transient state. Not addressed in v1.

---

## 6. Testing

All three contracts ship with unit tests in their `#[cfg(test)] mod test`
blocks. Run with `cargo test` from each contract's directory.

- `record_registry`: 6 tests — store/verify roundtrip, version chain with
  tombstones, idempotent updates (same hash = no-op), duplicate rejection,
  full version history, patient records aggregation.
- `access_manager`: 6 tests — see §2.5 above.
- `audit_trail`: 2 tests — ledger-timestamp monotonicity and
  `get_audit_log` parity with `log_access` returns.

Total: 14 contract-level tests. The suite asserts the cryptographic
properties this project depends on: multi-sig enforcement, timestamp
authority, append-only audit, and tombstoned versioning.
