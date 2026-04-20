# Code Review — ehr-blockchain

**Date:** 2026-04-20
**Commit state at review:** Sprints 1–6 complete (30/37 stories done, EXT-6 cancelled)
**Scope:** Full codebase — `backend/` (Rust), `frontend/` (React/TS), `smart-contracts/` (Soroban), `migrations/`, config

**Methodology:** Two parallel focused audits (backend+contracts, frontend) followed by verification pass. Several auto-flagged findings turned out to be false alarms after inspection; corrections are marked in each section.

---

## Executive Summary

- **Overall health: 7.5 / 10** — security fundamentals are solid, clinical features work, tests pass. Production-readiness gaps are mostly around operational hardening and UX polish, not correctness.
- **Critical issues: 2** (both backend auth hardening). Originally flagged 3; one was a false alarm.
- **Major issues: ~14** (mix of performance, a11y, and DX).
- **Tests:** Backend 47/47 · Contracts 10/10 · Frontend `tsc` clean · Contract tests cover BI-1 tombstone semantics
- **Biggest risk before thesis demo:** secrets in `.env` in git, token storage in `localStorage`.

---

## Critical (fix before thesis demo)

### C1 — Secrets in `.env` committed to version control
- **Files:** `.env`, `backend/.env`
- **Risk:** Even though `STELLAR_ADMIN_KEY=SAUZV3KJY5W7PGLK5L7OQHL3F7XCNHMPEMRDWFOM2XMR6EPIE52QAGQR` is a testnet key (no funds at risk), JWT secrets, DB passwords, and encryption key are also in the file. Precedent-setting: if this repo ever moves to mainnet or prod, secrets will already be in git history.
- **Fix:**
  ```bash
  git rm --cached .env backend/.env
  echo -e ".env\nbackend/.env" >> .gitignore
  git commit -m "security: stop tracking local .env files"
  ```
  Rotate the admin key after removing, since git history still holds it. `config.rs:29-54` already supports OS-keyring / file-based loading — document this path in `docs/stellar-admin-rotation.md` (already written).
- **Effort:** 15 minutes.

### C2 — JWT + full user profile stored in `localStorage`
- **File:** `frontend/src/context/AuthContext.tsx:31-43, 49-50, 92`
- **Risk:** XSS on any page in the SPA can read the token and impersonate the user until session revocation. Patient PHI (`first_name`, `last_name`, email, role) sits readable in `localStorage` alongside the token — violates the "minimum-necessary" principle even if the backend is tight.
- **Evidence:** No `dangerouslySetInnerHTML`, `eval`, or `innerHTML` mutations found in frontend (positive finding), so XSS risk today is low. But `localStorage` is defence-in-depth debt.
- **Fix:** Move auth to `httpOnly; Secure; SameSite=Strict` cookies. Requires backend change: `auth_handler` sets `Set-Cookie` on login, axios omits Authorization header, CORS `supports_credentials` already enabled (`main.rs:74`). Store only `user.id` in memory for display; fetch profile fresh from `/api/me` on app load.
- **Effort:** 2–3 hours (backend + frontend).

---

## Major (fix before production)

### M1 — Old-token backward-compat bypasses per-device session revocation
- **File:** `backend/src/middleware/jwt.rs:84-99`
- **Evidence:**
  ```rust
  if let (Some(jti), Some(pool)) = (claims.jti, pool) {
      let active: bool = sqlx::query_scalar("...").bind(jti).fetch_one(pool.get_ref())
          .await.unwrap_or(false);
      if !active { return Err(...Unauthorized("Session revoked")); }
  }
  ```
- **Correction from first-pass audit:** `unwrap_or(false)` actually fails **closed** (DB outage → `active=false` → `!active=true` → returns Unauthorized), not open. The first-pass agent got this inverted.
- **Real issue:** Tokens without `jti` (old tokens issued before the SEC-2 migration) skip the session check entirely. Since JWT expiry is 15 minutes, there is a grace window during migration where old tokens work but can't be revoked.
- **Fix:** Reject tokens without `jti` once migration grace window has passed:
  ```rust
  let Some(jti) = claims.jti else {
      return Err(actix_web::error::ErrorUnauthorized("Token pre-dates session migration; log in again"));
  };
  ```
- **Effort:** 5 minutes + one-liner note in release docs.

### M2 — Missing DB indexes on hot paths
- **Files:** `migrations/`
- **Missing indexes identified:**
  - `medical_records.created_by` — filtered in several handlers
  - `access_permissions.status` — `WHERE status = 'active'` is common
  - `sessions.break_glass_until` — `WHERE break_glass_until > NOW()` in auth_handler:402
  - `incidents.resolved_at` — `WHERE resolved_at IS NULL` in dashboard + admin views
- **Fix:** Add `migrations/033_add_missing_indexes.sql`:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_medical_records_created_by ON medical_records(created_by);
  CREATE INDEX IF NOT EXISTS idx_access_permissions_active ON access_permissions(patient_id, granted_to) WHERE status = 'active';
  CREATE INDEX IF NOT EXISTS idx_sessions_break_glass ON sessions(break_glass_until) WHERE break_glass_until IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_incidents_unresolved ON incidents(created_at DESC) WHERE resolved_at IS NULL;
  ```
- **Effort:** 15 minutes.

### M3 — Patient search scans up to 2000 rows in memory every request
- **File:** `backend/src/handlers/search_handler.rs:41-66`
- **Issue:** Because patient names are encrypted, no SQL index can help; the handler pulls 2000 rows, decrypts all of them, then filters in Rust. CPU + memory scales with patient count per query. Acknowledged in code as capstone-scale tradeoff.
- **Mitigation (short-term):** Rate-limit the search endpoint per user (reuse `services/rate_limit.rs`); drop the limit to 500; add a MIN_QUERY_LENGTH of 3 chars.
- **Long-term:** Blind indexing (deterministic hash of lowercased name prefix → searchable index column). Document in thesis as "known limitation, mitigation proposed".
- **Effort:** 30 minutes for rate-limit + docs.

### M4 — Frontend uses `alert()` (31×) and `prompt()` (9×) for error display and critical input
- **Files:** many; representative: `Patients.tsx:204`, `Records.tsx:63-67`, `Dashboard.tsx:454`
- **Risk:** `prompt()` for break-glass reason and order-kind offers no validation, no cancel button styled for the app, and trips modern browsers' popup-blocking in headless demos.
- **Fix:** Build a small `<ConfirmDialog>` + `<ErrorToast>` component pair and sweep the codebase. Use one modal component across the app.
- **Effort:** 2–3 hours to build + sweep.

### M5 — Every mutation does a full list refetch
- **Files:** every page with a CRUD flow; representative: `Patients.tsx:190` calls `loadPatients()` after create/update
- **Impact:** Visible flicker + extra network round-trip per action. At low patient counts it's fine; at 500+ patients the list-refetch becomes the perceptible lag.
- **Fix:** Update local state optimistically; rollback on error.
- **Effort:** 1 hour per major list page (Patients, Records, Appointments, Referrals, Messages).

### M6 — AuthContext value is a fresh object every render
- **File:** `frontend/src/context/AuthContext.tsx:104`
- **Evidence:** `<AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>` — new object identity every render; every `useAuth()` consumer re-renders on every AuthProvider render.
- **Fix:**
  ```tsx
  const value = useMemo(
    () => ({ user, token, login, logout, isAuthenticated: !!token }),
    [user, token, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  ```
- **Effort:** 2 minutes.

### M7 — Axios responses are untyped; 75 uses of `any` in error handling
- **File:** `frontend/src/services/api.ts` + every page's `catch` block
- **Pattern:**
  ```ts
  } catch (err: any) {
    const body = err.response?.data
    const msg = typeof body === 'string' ? body : body?.message || 'Failed'
    alert(msg)
  }
  ```
- **Fix:** Add typed response interfaces per endpoint (`api.post<LoginResponse>(...)`) and a central `extractApiError(err: unknown): string` helper using `axios.isAxiosError<ErrorResponse>(err)`.
- **Effort:** 3 hours end-to-end sweep.

### M8 — 4 moderate-severity dependency CVEs
- **File:** `frontend/package.json`
- **Output of `npm audit`:** axios ≤1.14.0 (SSRF via header injection, hostname normalisation bypass — transitive via `@stellar/stellar-sdk`), esbuild ≤0.24.2 (dev-server cross-origin read — via Vite).
- **Fix:** `npm audit fix --force` in a branch, re-run the frontend tests, then merge. Stellar SDK bumps to v15.0+ which may have API changes — test `VerifyReceipt` and `BlockchainExplorer` pages after the upgrade.
- **Effort:** 30 minutes with testing.

### M9 — TOTP verification silently returns false on internal error
- **File:** `backend/src/services/totp_service.rs:46`
- **Evidence:** `totp.check_current(trimmed).unwrap_or(false)`
- **Risk:** A transient clock-sync issue or base32 decode error is treated identically to a wrong code — user sees "Invalid OTP" with no telemetry of the real cause.
- **Fix:** Log the error with `eprintln!("[totp] internal error: {}", e)` before returning false. Doesn't change behaviour, just makes ops visible.
- **Effort:** 2 minutes.

### M10 — No React error boundary
- **File:** `frontend/src/App.tsx`
- **Impact:** A thrown error in any page (e.g. malformed API response, missing field) blanks the whole app — demo-killer.
- **Fix:** Wrap `<Routes>` in an `<ErrorBoundary>` with a "Something went wrong" fallback + "Return to dashboard" action.
- **Effort:** 30 minutes.

### M11 — Accessibility gaps
- **Files:** `Layout.tsx`, `GlobalSearch.tsx`, all modals
- **Gaps:**
  - Icon-only buttons lack `aria-label`
  - `GlobalSearch` input has `placeholder` but no `<label>`
  - Modals in `Patients.tsx:335-420` don't implement `role="dialog"` / focus trap — Tab can leak to the page behind
- **Fix:** Add `aria-label` to icon buttons; wrap inputs in `<label>` pairs; replace inline modals with a shared `<Modal>` component that traps focus.
- **Effort:** 3 hours.

### M12 — Console logging writes request/response details in production
- **File:** `frontend/src/services/api.ts:12-13, 23, 27`
- **Risk:** API URLs + error responses (potentially PHI-adjacent) end up in the browser console of whoever logs in on a shared machine.
- **Fix:** Guard with `if (import.meta.env.DEV)`.
- **Effort:** 2 minutes.

### M13 — `i18n` infrastructure exists but is barely used
- **Files:** `frontend/src/i18n/translations.ts` + `useTranslation.ts`
- **Status:** Hook + Filipino translation table set up; only `Layout.tsx` nav labels actually call `t()`. `tables.en` is empty (bootstraps correctly since `t()` falls through to the key).
- **Decision:** Either (a) sweep pages to wrap user-facing strings in `t()`, or (b) mark EXT-7 as "infrastructure delivered; page sweep out of scope". Currently halfway — neither demo-worthy as "internationalised" nor clean if removed.
- **Effort:** Option (a) 2–3 days for ~30 pages, option (b) 10 minutes of docs.

### M14 — Hardcoded Stellar Testnet URLs in frontend
- **Files:** `BlockchainExplorer.tsx:5`, `Login.tsx:215`
- **Fix:** Externalise to `import.meta.env.VITE_SOROBAN_RPC_URL` + `VITE_SOROBAN_EXPLORER_URL`; document in `frontend/.env.example`.
- **Effort:** 15 minutes.

---

## Minor (polish)

### m1 — Compile warnings in backend
8 warnings on `cargo build`: unused imports (`generate_token`, `require_role` in a few handlers), unused struct fields (`stellar_admin_key` loaded but not exposed by design — add `#[allow(dead_code)]` with a comment), unused RBAC middleware (`RoleGuard`, `RoleGuardMiddleware` superseded by `require_role()` — delete), unused helper (`authoritative_timestamp` only called from its own tests — either wire it into `log_action` where the policy is inlined, or delete the helper + test).

### m2 — `eprintln!` everywhere instead of structured logging
Acceptable for capstone; note as "post-capstone: adopt `tracing` crate" in your future-work section.

### m3 — Dynamic SQL in `patient_service.rs:248-252`
- **First-pass classification:** CRITICAL SQL injection.
- **Verified:** No injection risk. The `updates` vector is built from **hardcoded column names** (`"first_name = $1"`, etc.) based on which `Option` fields are `Some`. No user input reaches the SQL string — only the bind values, which are correctly parameterised via `.bind()`.
- **Remaining concern (MINOR):** The pattern is brittle. If a future contributor adds a sort-by-user-input feature using the same template, the injection becomes real. Consider `sqlx::QueryBuilder` as a standardisation. Not urgent.

### m4 — `sessionStorage` stores recent-patient list on Global Search
- **File:** `GlobalSearch.tsx:76-81`
- Any script on the domain can read which patients a clinician viewed today — minor privacy leakage on shared workstations.
- **Fix:** Move to in-memory state via a small zustand/context store; survives page navigation but not reload.

### m5 — Hardcoded prescription rule lists + drug-interaction pairs in `cds_service.rs`
Intentional per capstone scope (EXT-2 is MVP). Document in thesis that this is not a commercial CDS; production would need an external knowledge base (First Databank, RxNorm).

### m6 — No debounce cancellation token in `GlobalSearch`
Rapid-type then clear can land a late result after the input is empty. `AbortController` on the axios signal would fix it.

### m7 — Duplicate `uuidToBytes32Hex` helper
Exists in both `BlockchainExplorer.tsx:26-32` and `services/soroban.ts`. Consolidate.

### m8 — Inconsistent error message casing + punctuation
"Invalid response from server" vs "Invalid email or password." — pick one convention in a short style guide (e.g., sentence case, period, no "Please").

---

## Corrections vs. first-pass audit

These were flagged as CRITICAL in the first-pass automated audit and verified-down during the review:

| Initial flag | Actual severity | Why the correction |
|---|---|---|
| "SQL injection in `patient_service.rs:248-252`" | **MINOR (brittleness)** | Column names are hardcoded literals; only bind values are user-controlled, and those are parameterised. |
| "Session revocation silently fails open" | **MAJOR (old-token bypass, not fail-open)** | `unwrap_or(false)` actually fails *closed* — DB error → session rejected. Real issue is jti-less token backward compat. |
| "JWT leaks to Soroban RPC" | **FALSE ALARM** | `services/soroban.ts` uses the Stellar SDK's own RPC client and `BlockchainExplorer.tsx` uses bare `fetch()` — neither routes through the axios `api` instance that has the Auth interceptor. Verified: 0 `api.*` calls in either file. |

---

## Positive Findings

**Backend + contracts**

- **Encryption is textbook correct.** AES-256-GCM with a fresh 12-byte random nonce per encryption; `enc:v1:` prefix reserves space for key rotation; decrypt gracefully returns plaintext when the value isn't a ciphertext (handles migration).
- **BI-1 versioning + tombstones are sound.** Contract panics on duplicate `(record_id, version)`, `update_hash` atomically tombstones prior with a pointer to the new version, idempotent on same-hash retry. All 7 record-registry tests pass including should-panic cases.
- **BI-2 fix is present and tested.** `access_manager.rs:66-69` explicitly comments the fix, and `grant_access_persists_patient_permissions_vector` test verifies it.
- **BI-3 enforcement gate.** `record_handler::list_by_patient` genuinely queries Access Manager; DB-only fallback is clearly logged and audited separately.
- **BI-7 timestamp policy.** Audit rows get the ledger timestamp authoritatively when the chain mirror succeeds; tests cover ledger-vs-DB divergence.
- **SQL queries otherwise well-parameterised.** Every `sqlx::query*` call except the one flagged minor uses `.bind()` for user input.
- **Break-glass has teeth.** Emergency reads still fetch and return data, but every such read writes a `break_glass_read` audit row with the session's `break_glass_until` window. Admin dashboard banner when any session is active.
- **Bcrypt cost 12.** Appropriate, not defaulted to 4.
- **TOTP RFC 6238 compliant** with ±1 window tolerance (30 s drift accepted). 20-byte secret exceeds RFC 4226 minimum.

**Frontend**

- **No XSS vectors.** No `dangerouslySetInnerHTML`, `eval`, `new Function`, or `innerHTML` mutation found. User input is rendered as text. SVG icons are static.
- **ProtectedRoute + role-based nav filtering.** Unauthorized routes are both route-gated and hidden from navigation.
- **Idle timeout + silent refresh.** 60-second idle logout, 10-minute silent refresh via `/auth/refresh`; 401 interceptor dispatches `auth:expired` event cleanly.
- **Trustless verify path.** `VerifyReceipt.tsx` and `soroban.ts` go around the EHR backend entirely; the page advertises "no EHR backend was called" — honest to the thesis claim.
- **Consent capture is real.** Register form blocks registration without a current `consent_version`; Settings page shows revoke with clear consequences.
- **TypeScript strict mode with 0 errors.** `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` all on.
- **Responsive layout works.** Tailwind `md:` / `lg:` breakpoints are actually used, not just imported.

**Cross-cutting**

- **47/47 backend tests + 10/10 contract tests pass.** No flaky tests; runs in ~1s.
- **Sprint tracking honest.** `docs/sprint.yaml` reflects actual state (36/37 done, 1 cancelled with reasoning).
- **Documentation is real, not decorative.** `architecture.md`, `security-model.md`, `compliance.md`, `smart-contracts.md`, `data-flows.md`, `chapter3-diagrams.md` are each specific and load-bearing for the thesis.

---

## Recommended remediation order

If you have **half a day** before demo:
1. C1 secrets out of git (15 min)
2. M1 reject jti-less tokens (5 min)
3. M2 missing indexes (15 min)
4. M6 memoize AuthContext value (2 min)
5. M9 log TOTP errors (2 min)
6. M10 add error boundary (30 min)
7. M12 gate console logs (2 min)
8. M14 env-ify Stellar URLs (15 min)
9. m1 clean compile warnings (15 min)

**Total: ~2 hours. Eliminates 1 of 2 criticals + 7 majors + the compile-warning noise.**

If you have **a full week** before demo, add: C2 cookie-based auth, M4 replace alert/prompt, M7 typed API responses, M11 a11y sweep.

If you're writing this up for the thesis rather than fixing it: the Critical + Major list above is your "known limitations + future work" section — credible because it's specific and evidence-based.

---

## Appendix — commands run for verification

```text
cargo test                    # 47/47 backend tests passed
cargo test -p record_registry # 7/7 contract tests passed
cargo test -p access_manager  # 3/3 contract tests passed
cargo build 2>&1 | grep warning  # 8 warnings (all non-fatal, listed in m1)
npx tsc --noEmit              # 0 errors, 0 warnings
npm audit                     # 4 moderate CVEs (axios, esbuild transitive)
```
