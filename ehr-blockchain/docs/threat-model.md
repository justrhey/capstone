# Threat Model

## What the chain proves

For every access grant on `access_manager` v2, the on-chain transaction
carries **two distinct Ed25519 signatures** — one from the provider-admin
key and one from the patient's per-user key. A third party reading any
Stellar block explorer can verify both signatures cryptographically without
trusting our backend.

For record-hash anchoring (`record_registry`) and audit-event mirroring
(`audit_trail`), the chain proves the hash existed at a specific ledger
timestamp, signed by the provider-admin key.

## What the chain does NOT prove (yet)

- **Patient self-sovereignty.** The patient's key is custodial — held and
  decrypted by the backend on the patient's behalf, like a fiduciary. The
  patient does not personally sign with a wallet they hold. This is a
  prototyping decision; production migration to Freighter / mobile / HSM
  custody requires no contract change because multi-sig is enforced at the
  contract level.
- **PHI integrity beyond the hash.** SOAP notes are stored encrypted in
  PostgreSQL (AES-256-GCM, fresh random nonce per record at
  `backend/src/services/encryption.rs:22-32`). The chain attests the
  *hash*; the encrypted column is the source of plaintext.

## Assets and adversaries

| Asset | Threat | Control |
|---|---|---|
| `STELLAR_ADMIN_KEY` | Exfiltration → forge any record / grant | `STELLAR_ADMIN_KEY_FILE` precedence (`backend/src/config.rs:29-57`); never logged; rotation runbook (`docs/runbook-key-rotation.md`) |
| `users.stellar_secret_enc` | DB dump → forge patient signatures | AES-256-GCM with `ENCRYPTION_KEY` (separate variable from admin key); decrypted only in-process for tx build, never returned by an HTTP handler |
| `ENCRYPTION_KEY` | Compromise → SOAP plaintext + patient secrets recoverable | Env-only today; future: KMS |
| Soroban CLI / Node helper | Tampered binary submits malicious tx | Helper invoked with hardcoded path; payload built server-side from typed fields |

## Key separation of duties

A leaked `STELLAR_ADMIN_KEY` alone can no longer forge a patient consent —
the attacker also needs the specific patient's secret, which lives
encrypted in the database under a *different* env var (`ENCRYPTION_KEY`).
That's two secrets controlled by two distinct config surfaces. The chain
captures this separation cryptographically.

## Failure modes

- **Soroban CLI / RPC unavailable.** When a write to chain cannot be
  confirmed, the row is persisted to
  `blockchain_transactions(status='pending', pending_payload=<json>)`.
  The migration that adds those columns lives at
  `migrations/033_multi_sig_and_pending_anchors.sql`. Wiring of the
  enqueue path into every blockchain call site is tracked in the
  implementation plan
  (`docs/superpowers/plans/2026-04-30-blockchain-integrity-fixes.md`,
  Tasks 9–13) and not yet wired in code as of this writing.
- **Patient identity missing.** A grant that cannot load the patient
  keypair must fail loudly, never silently downgrade to single-sig. The
  contract enforces this — without the patient's auth entry, the host
  aborts the call.
- **`STELLAR_ADMIN_KEY=placeholder`.** Same — fail loudly with an explicit
  reason, never downgrade.

## Out of scope (documented future work)

- Patient wallet custody (Freighter / mobile / HSM).
- Background retry worker for the pending-anchor queue (currently a manual
  admin endpoint per the plan).
- KMS-backed admin and encryption keys.
- Force-revoke without patient signature (subpoena / account-takeover
  scenarios).
