# Security Model

STRIDE-style threat model for the current implementation. Each control is cross-referenced to the code that enforces it. Residual risks are listed explicitly — the project is positioned as a **notarization layer**, not a trustless record, and this doc makes that boundary precise.

---

## 1. Assets

| Asset | Sensitivity | Storage |
|---|---|---|
| Patient PII (name, DOB, contact, address, blood type) | High | PostgreSQL; name fields AES-256-GCM at rest |
| Medical record narrative (diagnosis, treatment, notes) | High | PostgreSQL AES-256-GCM at rest; SHA-256 on-chain |
| Medications / allergies | High | PostgreSQL plaintext (structured fields) |
| Credentials (password hashes) | Critical | PostgreSQL bcrypt cost 10 |
| JWT signing key | Critical | `.env` → memory; rotation invalidates sessions |
| AES-256 master key | Critical | `.env` → memory; rotation breaks all existing ciphertext |
| Stellar admin secret | Critical | `.env`; owns all three contracts |
| Audit log (who/what/when/IP) | High | PostgreSQL; subset mirrored on-chain |
| Blockchain record hashes | Low (public-by-design) | On-chain; no plaintext leak, possible correlation risk |

---

## 2. Actors

| Actor | Trust level | Threat surface |
|---|---|---|
| Patient | Low (untrusted external) | Can see own data; can grant/revoke access to staff |
| Doctor / Nurse | Medium | Can see all patients & records (no assignment model) |
| Auditor | Medium | Read-only audit log |
| Admin | High | All CRUD; user management; staff creation |
| Backend operator | Highest | Root over DB + blockchain admin key |
| External internet | Zero | Must cross CORS + JWT |

---

## 3. Trust Boundaries

```
[Internet]  ─TLS?─  [Rust API]  ─local─  [PostgreSQL]
                        │
                        └── exec(soroban) ── [Stellar network]
```

| Boundary | Enforcement | Weakness |
|---|---|---|
| Internet ↔ API | JWT middleware (`middleware/jwt.rs`) + CORS allowlist | TLS is a deployment concern; dev is HTTP |
| API ↔ Browser session | HS256 JWT, 15-min expiry, 10-min silent refresh | Stored in `localStorage` (XSS risk) |
| API ↔ DB | Parameterized SQL via `sqlx`; password-auth; no role-scoped DB users | Single DB user has full privilege |
| API ↔ Blockchain | `STELLAR_ADMIN_KEY` on disk; `soroban` CLI spawned | Leaks of `.env` compromise contracts |

---

## 4. STRIDE Matrix

### 4.1 Spoofing

| Threat | Control | Code | Residual |
|---|---|---|---|
| Credential reuse / weak password | bcrypt (cost 10) + min-length 8 + email validator | `auth_service.rs::{register_user,login_user}` | No breach-corpus check, no rate-limit on password resets (doesn't exist yet) |
| JWT forgery | HS256 with rotatable `JWT_SECRET` | `auth_service::{generate_token,decode_token}` | Symmetric key compromise forges any user |
| Session replay | `exp` claim + 15-min window | `Claims.exp` | No per-token revocation list |
| Brute-force login | Per-IP sliding window: 10 attempts / 60s | `services/rate_limit.rs` + `handlers/auth_handler.rs::login` | Shared IPs behind NAT, cluster not handled |

### 4.2 Tampering

| Threat | Control | Code | Residual |
|---|---|---|---|
| DB row mutation | AES-GCM authenticated encryption on sensitive columns; SHA-256 hash anchored to chain | `services/encryption.rs`, `services/record_service.rs`, `services/blockchain_service.rs::store_record_hash` | **On update, the backend overwrites the on-chain hash, so an adversary-in-the-backend can tamper without detection.** See §8 Residual Risks. |
| In-transit payload | CORS-restricted origins + deployment-time TLS | `main.rs` CORS config | Dev-mode HTTP is plaintext |
| Audit-log deletion | DB row has no delete endpoint; mirrored on-chain (medical_record only) | `audit_handler.rs`, `audit_service.rs` | DB `DELETE FROM audit_logs` by an attacker with PG access is not prevented |

### 4.3 Repudiation

| Threat | Control | Residual |
|---|---|---|
| Staff denies accessing a record | Audit log with `user_id` + `resource_id` + `ip_address`; on-chain mirror for `medical_record` | Only mutations are logged; reads are not |
| Admin denies granting access | `permission_granted` in audit log + on-chain mirror | Same admin can edit the DB; on-chain trail is the stronger evidence |

### 4.4 Information Disclosure

| Threat | Control | Residual |
|---|---|---|
| Plaintext PHI in backups | Column-level AES-256-GCM before insert | DB-level dump still includes ciphertext; key is in `.env` |
| Plaintext PHI on chain | Only hashes go on-chain | UUID + hash + timestamp may allow correlation attacks |
| Error-message leakage | `AppError` display strings are generic | One-shot 401s expose "invalid email or password"; standard |
| Role-disallowed reads | `require_role` / `require_claims` on every handler; resource-level owner check for patient role | Doctor/Nurse/Admin see all patient data (no "minimum necessary" scope) |

### 4.5 Denial of Service

| Threat | Control | Residual |
|---|---|---|
| Login flooding | Rate limit 10/60s | Single-process; no global coordination |
| API flooding | None at app layer | Relies on upstream proxy / WAF |
| DB connection exhaustion | SQLx connection pool default | No explicit limit; deployment concern |
| Large paginated reads | Clamp `limit <= 500`, default `100` | — |

### 4.6 Elevation of Privilege

| Threat | Control | Residual |
|---|---|---|
| Self-registering as admin | `/api/auth/register` forces `role=patient`; staff via admin-only `/api/users/staff` | — |
| Role check bypass via direct query | All data handlers call `require_role` or `require_claims`; JWT middleware rejects bad tokens early | A handler that forgets to call `require_*` is silently public; no compile-time guard |
| Patient accessing another patient's data | Ownership check: `GET /api/patients/{id}`, `GET /api/patients/{id}/records`, `GET /api/permissions`, etc. verify `patients.user_id == claims.sub` when role=patient | Staff roles still see all rows |

---

## 5. Cryptography

| Use | Algorithm | Source |
|---|---|---|
| Password hashing | bcrypt, cost 10 | `bcrypt` crate |
| Token signing | HS256 | `jsonwebtoken` crate |
| Field encryption | AES-256-GCM, 12-byte random nonce | `aes-gcm` crate via `services/encryption.rs` |
| Record integrity | SHA-256 over `diagnosis|treatment|notes` | `services/hash_service.rs` |
| On-chain commitment | 32-byte record hash stored in Record Registry | contract `store_hash` |

**Key derivation:** none; `ENCRYPTION_KEY` is a 32-byte random hex, used directly as the GCM key. Rotating it invalidates all existing ciphertext unless a re-encrypt migration runs first.

**Version prefix:** `enc:v1:` on encrypted fields enables future algorithm changes (`v2:`) without breaking the legacy decode path.

---

## 6. Secret Management

Current: `.env` files (two locations) for both backend paths. Both git-ignored since project inception.

| Secret | Current | Recommended for real deployment |
|---|---|---|
| `JWT_SECRET` | 64-char URL-safe random in `.env` | Secrets manager, rotated quarterly |
| `ENCRYPTION_KEY` | 32-byte hex in `.env` | HSM / KMS envelope encryption |
| `STELLAR_ADMIN_KEY` | Testnet key in `.env` | HSM; never in file |
| `DATABASE_URL` password | `.env` | Secrets manager |

See `docs/stellar-admin-rotation.md` for the testnet admin rotation runbook.

---

## 7. Defense-in-Depth Layers

1. **Transport**: CORS allowlist (`localhost:*` in dev), deployment TLS.
2. **AuthN**: JWT bearer on all non-auth, non-health routes (enforced by middleware).
3. **AuthZ**: per-handler `require_role` / `require_claims` + resource ownership for patient role.
4. **Validation**: email format, name length (1-100), password ≥ 8, role whitelist, UUID parsing by extractor type.
5. **Encryption at rest**: AES-256-GCM on PII + clinical free-text.
6. **Notarization**: SHA-256 anchored on Stellar Record Registry.
7. **Audit**: every mutation logged server-side + (for medical records) on-chain.
8. **Rate limiting**: login 10/60s per IP.
9. **Session hygiene**: 15-minute JWT + silent refresh + 60-second idle logout.

---

## 8. Residual Risks (acknowledged, not fixed)

The committee should know these.

1. **Compromised-backend adversary can tamper undetected.**
   An attacker with write access to the DB and the Stellar admin key can alter `diagnosis` and re-call `store_hash`. `verify_hash` will return `true` against the new hash. See `docs/smart-contracts.md` §1.5 for the proposed v2 mitigation (version + tombstone).
2. **Access Manager is a mirror, not a gate.**
   The backend never calls `check_access` before serving data. Removing the DB row but leaving the on-chain grant (or vice versa) creates divergence.
3. **Doctor/nurse see all patients.** No assignment model; "minimum necessary" (HIPAA §164.502(b)) not enforced.
4. **Reads are not audited.** Only mutations.
5. **JWT in `localStorage`.** An XSS bug exfiltrates it. Moving to HttpOnly cookies requires a CORS + CSRF redesign.
6. **Single DB user has full privilege.** Compromise is total.
7. **No 2FA.** Healthcare standard; tracked in `docs/compliance.md`.
8. **No break-glass pathway.** Emergency access without record owner's consent not supported.

---

## 9. Incident Response (not implemented)

Documented for completeness; the following do **not** exist in code:

- Breach-detection triggers
- Notification pipelines
- Key-rotation runbook for `ENCRYPTION_KEY`
- Automated user-session revocation on role change

A deployment plan needs these. See `docs/compliance.md` §Breach Notification.
