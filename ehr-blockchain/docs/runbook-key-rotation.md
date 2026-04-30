# Runbook — Key Rotation

## Provider-admin key (`STELLAR_ADMIN_KEY`)

The admin key signs every contract mutation. Rotate when:

- the key has been committed to a public repo (treat as burned),
- a developer with access to the secret leaves the team,
- on a fixed schedule (recommended: every 90 days for production).

### Steps

1. **Generate a fresh keypair** off-server:
   ```bash
   soroban keys generate admin-new --network testnet
   soroban keys address admin-new          # G... — new public address
   soroban keys show admin-new             # S... — capture once, treat as secret
   ```

2. **Fund the new account** on testnet via friendbot:
   ```bash
   curl "https://friendbot.stellar.org?addr=$(soroban keys address admin-new)"
   ```

3. **Re-init each contract with the new owner.**
   Today's contracts only honour `init` once, so for testnet rotation the
   pragmatic path is to **redeploy** under the new key:
   ```bash
   for C in access_manager record_registry audit_trail; do
     soroban contract deploy \
       --wasm target/wasm32-unknown-unknown/release/${C}.wasm \
       --source admin-new \
       --rpc-url https://soroban-testnet.stellar.org \
       --network-passphrase "Test SDF Network ; September 2015"
     # capture each new contract id
   done
   ```
   For production, the contracts would need a `transfer_owner(new_owner)`
   method. Documented as future work.

4. **Update the secret file** at `STELLAR_ADMIN_KEY_FILE`:
   ```bash
   echo -n "$(soroban keys show admin-new)" > /var/secrets/stellar_admin.key
   chmod 600 /var/secrets/stellar_admin.key
   ```
   Or, for local dev, edit `.env` to set the new `STELLAR_ADMIN_KEY=...`.

5. **Restart the backend** so `Config::from_env` re-reads the file. Watch
   for `[config] Loaded .env from ...` and confirm there is no
   `STELLAR_ADMIN_KEY loaded inline` warning when the file path is used.

6. **Smoke test**: create a record + grant; confirm the new contract IDs
   appear in `blockchain_transactions.contract_id`.

7. **Decommission the old key**: zeroize the old secret file. Optionally
   sweep its testnet balance back to a treasury account.

## Patient per-user keys (`users.stellar_secret_enc`)

Today these are not rotated — each patient has one Stellar key for life.
If the underlying `ENCRYPTION_KEY` rotates, run the existing
`backfill_encrypt_on_startup` flow which is **idempotent** for already-
encrypted columns (`backend/src/services/encryption.rs:92-198`).

A patient-key rotation procedure is future work; the contract supports it
because grants are keyed by `patient_id` (UUID-derived 32-byte hex), not
by the patient's Stellar address.

## Database encryption key (`ENCRYPTION_KEY`)

Rotation requires re-encrypting all `enc:v1:` columns under the new key.
Approach (not yet implemented):

1. Add `enc:v2:` prefix support in `services/encryption.rs`.
2. Add a one-shot migration job that decrypts under v1, re-encrypts under v2.
3. After verification, retire the v1 key.

## Pre-defense checklist (capstone)

- [ ] Confirm `.env.example` has placeholder admin key, not a real secret.
- [ ] Confirm any real secret used in demo lives in `.env` (gitignored), not in
      `.env.example` or anywhere else tracked.
- [ ] Run `git log --all -S 'STELLAR_ADMIN_KEY=S' -- ehr-blockchain/.env.example`
      to identify when a real value was committed; rotate that key on testnet
      regardless of whether it is currently in HEAD.
- [ ] Have the friendbot URL ready in case the admin account runs out of XLM
      mid-demo.
