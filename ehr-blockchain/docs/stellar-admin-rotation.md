# Stellar Admin Key Rotation Runbook

The `STELLAR_ADMIN_KEY` in `.env` is the secret key of the Stellar account that **owns** the three deployed Soroban contracts (Record Registry, Access Manager, Audit Trail). Rotating it takes the contracts with it — there is no "transfer ownership" shortcut unless your contract exposes an admin-transfer method (the included lib.rs files do not).

This document is a safe, minimal redeploy flow for Testnet.

---

## Prerequisites

1. **Soroban CLI** installed and on PATH.
   ```bash
   cargo install --locked soroban-cli
   soroban --version
   ```
2. **Rust toolchain** with the `wasm32-unknown-unknown` target.
   ```bash
   rustup target add wasm32-unknown-unknown
   ```
3. The current repo cloned, with `smart-contracts/` present.
4. A working backup of the current `.env` (**keep the old key** until you've confirmed the new deployment works — you may need to decommission things signed by the old key).

---

## Steps

### 1. Generate a new keypair

```bash
soroban keys generate new-admin
soroban keys address new-admin     # prints the public key (G…)
soroban keys show new-admin        # prints the secret key (S…)  KEEP PRIVATE
```

### 2. Fund the new account on Testnet

```bash
soroban keys fund new-admin --network testnet
```

This should return a success response; the account will have 10 000 test XLM.

### 3. Build the contracts

From the repo root:

```bash
cd smart-contracts
soroban contract build
```

This produces three `.wasm` files under `target/wasm32-unknown-unknown/release/`:
- `record_registry.wasm`
- `access_manager.wasm`
- `audit_trail.wasm`

### 4. Deploy each contract under the new admin

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/record_registry.wasm \
  --source new-admin \
  --network testnet
# → prints new contract ID (C…)

soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/access_manager.wasm \
  --source new-admin \
  --network testnet

soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/audit_trail.wasm \
  --source new-admin \
  --network testnet
```

Record the three new contract IDs.

### 5. Initialize each contract (if its `init` method expects an admin)

Each contract in `smart-contracts/*/src/lib.rs` defines an `init` function that sets the admin. Call it once per contract:

```bash
soroban contract invoke \
  --id <NEW_RECORD_REGISTRY_ID> \
  --source new-admin \
  --network testnet \
  -- init --admin $(soroban keys address new-admin)

# repeat for access_manager and audit_trail
```

### 6. Update `.env`

Edit both `ehr-blockchain/.env` and `ehr-blockchain/backend/.env`:

```env
RECORD_REGISTRY_CONTRACT_ID=<NEW_ID_FROM_STEP_4>
ACCESS_MANAGER_CONTRACT_ID=<NEW_ID_FROM_STEP_4>
AUDIT_TRAIL_CONTRACT_ID=<NEW_ID_FROM_STEP_4>
STELLAR_ADMIN_KEY=<NEW_SECRET_FROM_STEP_1>
```

**Production note — keep the secret out of `.env`:** the backend also accepts
`STELLAR_ADMIN_KEY_FILE` pointing at a file whose contents are the secret.
When both are set, the file wins. For real deployments, prefer the file so
the value never touches shell history, `printenv`, or environment dumps:

```bash
# Example: deploy secret to a file with tight perms, point env at it.
umask 077
echo 'S...SECRET...' > /etc/ehr/stellar_admin.key
chmod 600 /etc/ehr/stellar_admin.key
export STELLAR_ADMIN_KEY_FILE=/etc/ehr/stellar_admin.key
```

The startup log will emit a `[config]` warning if the inline
`STELLAR_ADMIN_KEY` path is taken — treat that as a finding in any
compliance review.

Also update `frontend/src/pages/Dashboard.tsx` — the `CONTRACTS` constant lists IDs for the "Soroban Contracts" panel; change all three there too.

### 7. Restart the backend

```bash
taskkill /F /IM ehr-backend.exe   # Windows
cargo run --manifest-path backend/Cargo.toml
```

### 8. Smoke test

- Create a new medical record in the UI.
- Watch backend logs — you should see `[blockchain]` lines only on **failure**. No output = success.
- Open the Dashboard and click any contract link — you'll land on Stellar Expert for the new ID; the latest tx should be from step 5.

### 9. Decommission the old key

Once smoke tests pass, the old `SAUZV3…AGQR` key is obsolete. It is still in this repo's `.env` history (not in git, since `.env` is git-ignored), but remove it from any other location you stored it.

---

## What about historical on-chain data?

Records that were hash-anchored against the **old** Record Registry contract are still verifiable — their `blockchain_tx_id` points at the old contract's transactions. The new contract starts with an empty hash store.

Two options for the transition period:
- **Soft cutover** (recommended for demos): leave `blockchain_tx_id` as-is for old rows; new records use the new contract. The frontend "Verify" button will show `unavailable` for old rows against the new contract — acceptable for a paper.
- **Hard re-anchor**: write a one-shot Rust helper that re-hashes every existing record and calls `store_hash` on the new contract. Not recommended unless you need audit-trail continuity.

---

## Rollback

If step 8 fails:
1. Revert `.env` and `Dashboard.tsx` to the old values.
2. Restart the backend.
3. The old contracts are untouched and still work under the old admin.

Nothing on-chain is "deleted" by this process — old contracts remain queryable forever; they just stop receiving new transactions from your app.
