# What Changed and How It Works (Plain-English Explainer)

> Audience: anyone — including the panel — who wants to understand the
> recent changes without diving into Rust, smart contracts, or React.
> The technical details live in `architecture.md`, `smart-contracts.md`,
> and `threat-model.md`. This document is the *story* version.

---

## The big picture

Think of this project as a hospital records system that also writes a
permanent receipt to a public bulletin board (the **blockchain**) every
time something important happens. Before these changes, only the
*hospital* could write receipts. Now the *patient* also has to sign.

The recent changes do five things:

1. Make consent receipts require two signatures instead of one.
2. Add a "waiting room" for receipts when the bulletin board is down.
3. Give every patient their own digital signature.
4. Stop the website from lying about contract addresses.
5. Remove an obvious password that shouldn't have been in the example
   config file.

Plus three new documents that explain everything.

---

## 1. The lock on consent receipts now needs two keys

**File:** `smart-contracts/access_manager/src/lib.rs`

Imagine your school locker has one lock and only the principal has a key.
Anyone who steals the principal's key can open every locker. We added a
second lock — the *student's* lock — to the consent locker. Now to open
it, both keys must turn at the same time.

In code, every time a doctor "grants access" to a patient's records, the
smart contract demands **two digital signatures — the hospital's *and*
the patient's — in the same transaction**. If either is missing, the
chain rejects the call.

We wrote tests that prove this. One test (`grant_access_succeeds_with_both_signatures`)
shows the call works when both sign. Two tests
(`grant_access_fails_without_patient_auth`, `revoke_access_fails_without_patient_auth`)
show the call **panics** when only one signs. Six tests total now live in
that contract.

### Why this matters for defense

If the panel asks "what does the chain actually prove?", the answer is
no longer "the hospital admin said this happened." It is now: *"Two
specific keys signed this consent. Anyone can verify both signatures
on a public block explorer without trusting our backend code."*

---

## 2. A waiting room for failed receipts

**Files:** `migrations/033_multi_sig_and_pending_anchors.sql` and
`backend/src/services/anchor_queue.rs`

**Before:** if the bulletin board was down (Soroban CLI missing, RPC
unreachable, network glitch), the hospital saved the chart and quietly
skipped writing the receipt. The system *acted like* it succeeded but
really didn't anchor anything to the chain. That is a fib — and a
panelist could expose it in seconds with `mv $(which soroban) /tmp`
followed by a normal save.

**After:** we added new columns to the `blockchain_transactions` table —
`status`, `attempts`, `last_error`, `pending_payload`. When the chain is
unreachable, the system drops a slip into a "waiting room" labeled
`pending`. The slip carries everything needed to retry: which contract,
which method, the original arguments, and why it failed.

Later, when the chain is back, an admin can press a retry button and the
slip gets posted for real, flipping `pending` → `confirmed`. The API
response always reports `anchor_status: "pending"` or
`"confirmed"` honestly — no more silent failures.

### What's done vs. what's deferred

The schema and the helper module (`anchor_queue.rs`) exist and are
tested. The retry button in the UI and the wiring through every
blockchain call site is in the implementation plan but not in this
branch (see "What's not finished yet" at the end).

---

## 3. Each patient gets their own digital signature

**File:** `backend/src/services/stellar_identity.rs`

To make point #1 actually work, every patient needs their own digital
signing key — like a personal stamp. We don't ask patients to download a
crypto wallet app (that would be too much for a prototype). Instead,
when a patient signs up, the system generates a Stellar Ed25519 keypair
for them and locks the secret in the database with strong encryption
(**AES-256-GCM**, the same lock already used for medical notes).

When the system needs to "sign as the patient," it briefly unlocks the
stamp, uses it once to authorize the transaction, and discards the
unlocked copy. The unlocked secret never leaves the function that
signs — it is not logged, not returned to a browser, not stored.

This pattern is called **custodial fiduciary** — the hospital holds the
patient's stamp on their behalf, like a bank holding the key to your
safe-deposit-box. The threat-model document calls this out plainly so
nobody mistakes it for self-sovereign custody.

Tests prove three properties:

- the generated keys look like real Stellar addresses (start with `G`,
  56 characters long),
- two generated keys are never the same,
- a stamp survives a lock → encrypt → unlock round trip without
  corruption.

---

## 4. The frontend can't lie about contract addresses anymore

**Files:** `frontend/src/config/contracts.ts` and `frontend/.env.example`

**Before:** the React app had three Stellar contract addresses *typed
directly into the code* (`BlockchainExplorer.tsx` lines 9-22). If you
ever redeployed a contract — which you *must* for the multi-sig
upgrade — the website would happily keep pointing at the old, wrong
contract. Nobody would notice mid-demo until something failed
mysteriously.

**After:** the addresses come from environment variables (`VITE_*`)
loaded from a config file. There is one new module
(`config/contracts.ts`) that everyone imports from. If the config file
is missing or any required value is empty, the build fails loudly with
a clear error: `Missing required env var VITE_ACCESS_MANAGER_CONTRACT_ID.
Copy .env.example to .env and fill it in.`

Loud failures are much better than quiet ones, especially during a live
demo.

---

## 5. The obvious password was removed from the example file

**File:** `.env.example`

**Before:** the example config file had a *real* Stellar testnet secret
key written in it (`STELLAR_ADMIN_KEY=SAUZV3KJ...`). Anyone reading the
GitHub repo could use it. For a public capstone repo, that's a finding
the panel will look for.

**After:** replaced with the placeholder
`S_REPLACE_WITH_REAL_STELLAR_SECRET_KEY` and a short comment pointing to
the safer way: `STELLAR_ADMIN_KEY_FILE=/path/to/secret`, where the
secret lives in a file with restricted permissions instead of an
environment variable.

The old value is **still in git history** (`git log -p` will find it).
The actual fix is to rotate that key on testnet — generate a new one
and abandon the old one. The runbook walks through the rotation steps.

---

## 6. Three new explainer documents

- **`threat-model.md`** — exactly what the chain proves, what it
  doesn't, and what would have to leak for an attacker to forge
  something. The most useful doc for defense Q&A.
- **`runbook-key-rotation.md`** — step-by-step for replacing the
  hospital's master key when it gets compromised. Includes a
  pre-defense checklist so you don't go in with a known-burned secret.
- **Updated `architecture.md` and `smart-contracts.md`** — current
  contract ABI (with both signatures), current contract IDs, current
  test count (14 contract-level tests across the three contracts).

When the panel asks a question, you point at the file.

---

## What's not finished yet

This branch closes the **defense loopholes** but does not ship the
fully-wired production version. To complete the job (and the
implementation plan covers all of it), you would still need to:

1. **Deploy the new multi-sig Access Manager** to Stellar Testnet —
   one `soroban contract deploy` command. Capture the new contract ID
   and update `.env` files in both backend and frontend.
2. **Apply migration 033** against your dev database — one `sqlx
   migrate run` command.
3. **Connect the new modules to the permission-grant flow**. Right now
   `stellar_identity.rs` and `anchor_queue.rs` are tested in isolation
   but not yet called from the HTTP handler that grants access. Tasks
   8 through 13 of the implementation plan
   (`docs/superpowers/plans/2026-04-30-blockchain-integrity-fixes.md`)
   spell out the wire-up.

If a panelist asks "where is the production version?", point at that
plan. The design is settled, the contract is upgraded, the database is
ready, and the helper modules pass tests — the work that remains is
plumbing, not design.

---

## Defense cheat sheet

| Likely question | One-sentence answer | Where to point |
|---|---|---|
| "Is this really blockchain?" | Three Soroban contracts deployed on Stellar Testnet, every record write produces a real transaction with a real `tx_hash` you can look up on `stellar.expert`. | `architecture.md` §6, `.env.example`, `BlockchainExplorer` page |
| "What does the chain prove?" | For access grants, two distinct signatures (provider + patient). For record hashes and audit events, the admin's signature plus the ledger timestamp. | `threat-model.md` §"What the chain proves" |
| "What if the admin key leaks?" | Hash anchoring and audit could be forged — but consent grants cannot, because the attacker also needs the specific patient's encrypted signing key from the database. | `threat-model.md` §"Key separation of duties" |
| "What if the chain is unreachable?" | The system persists the failure as a `pending` row with all the original arguments and reports `anchor_status: pending` to the API caller. Retries are explicit. | `migrations/033_multi_sig_and_pending_anchors.sql`, `services/anchor_queue.rs` |
| "How do you handle key rotation?" | Documented procedure for testnet rotation; production would need a `transfer_owner` contract method which is documented as future work. | `runbook-key-rotation.md` |
| "Where are the tests?" | 14 contract-level tests + per-module backend tests. `cargo test` runs them. | `smart-contracts.md` §6, each contract's `mod test` block |
