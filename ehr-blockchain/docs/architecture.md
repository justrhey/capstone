# System Architecture

> **Positioning.** This system is a **Blockchain-Notarized EHR for Regulatory Compliance.**
> The blockchain provides an immutable notarization layer over a conventional, fully-featured EHR backend. It does not claim trustless operation; the backend remains the authoritative enforcement point.

---

## 1. High-Level View

```
┌────────────────┐  HTTPS   ┌───────────────────────┐  libpq   ┌─────────────┐
│  React + Vite  │ ───────▶ │   Rust / Actix-web    │ ───────▶ │ PostgreSQL  │
│  (frontend)    │          │   (API backend)       │          │ (records)   │
└────────────────┘ ◀─────── └─────────┬─────────────┘ ◀─────── └─────────────┘
       ▲                              │ exec(soroban)
       │                              ▼
       │                   ┌─────────────────────────┐
       │                   │   Stellar Testnet       │
       │                   │   Soroban CLI (shell)   │
       │                   └─────────┬───────────────┘
       │                             │ invoke
       │                             ▼
       │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
       │   │ Record        │  │ Access        │  │ Audit         │
       │   │ Registry      │  │ Manager       │  │ Trail         │
       │   │ (contract)    │  │ (contract)    │  │ (contract)    │
       │   └───────────────┘  └───────────────┘  └───────────────┘
       │
       └──── Stellar Expert (public explorer, optional read path)
```

---

## 2. Components

| Component | Path | Tech | Role |
|---|---|---|---|
| Frontend SPA | `frontend/` | React 18 + TypeScript 5 + Vite 5 + Tailwind 3 | All user-facing UI, role-based navigation, client-side session + silent JWT refresh |
| Backend API | `backend/` | Rust + Actix-web 4 + SQLx 0.7 | Business logic, RBAC, encryption, audit, blockchain dispatch |
| Database | PostgreSQL 15+ | — | Canonical store of users, patients, records, permissions, audit logs, tx metadata |
| Soroban CLI | `soroban-cli` | external binary | Backend shells out to invoke contracts; failures are caught silently |
| Smart contracts | `smart-contracts/` | Rust + Soroban SDK | Record Registry, Access Manager, Audit Trail (Stellar Testnet) |
| Public explorer | `stellar.expert` | external SaaS | Third-party read path for users and auditors |

---

## 3. Backend module map

```
backend/src/
├── main.rs                   // App wiring, CORS, middleware order
├── config.rs                 // Env-driven Config, shared via web::Data
├── middleware/
│   ├── jwt.rs                // Extracts Claims from Authorization: Bearer …
│   └── rbac.rs               // Role guard (declared, enforced in-handler via require_role)
├── models/                   // User, Patient, MedicalRecord, Claims, DTOs
├── handlers/                 // HTTP surface — thin; defers to services
│   ├── auth_handler.rs       //   POST /api/auth/{login,register,refresh}
│   ├── patient_handler.rs    //   CRUD + /me
│   ├── record_handler.rs     //   CRUD + /:id/verify
│   ├── verify_handler.rs     //   POST /api/verify
│   ├── permission_handler.rs //   Access grants
│   ├── audit_handler.rs      //   Audit log read
│   └── user_handler.rs       //   User mgmt + staff create/list
└── services/                 // All business logic
    ├── auth_service.rs       // Password hashing, JWT, role helpers, AppError
    ├── patient_service.rs    // CRUD with field encryption
    ├── record_service.rs     // CRUD with field encryption + hash + chain write
    ├── encryption.rs         // AES-256-GCM field encryption (enc:v1: prefix)
    ├── hash_service.rs       // SHA-256 content hashing
    ├── blockchain_service.rs // Silent-fallback Soroban CLI wrapper
    ├── audit_service.rs      // DB audit write + on-chain mirror
    ├── pagination.rs         // Clamp/default for limit/offset
    └── rate_limit.rs         // Per-IP sliding-window limiter
```

---

## 4. Trust Boundaries

| Boundary | Enforced by | Notes |
|---|---|---|
| Browser ↔ API | TLS (deployment concern), CORS allowlist, JWT | Dev uses `http://localhost:*`; prod must terminate TLS before the Rust server |
| API ↔ PostgreSQL | `sqlx` parameterized queries, connection string secret | Single trust zone with backend |
| API ↔ Soroban | Soroban CLI over RPC; admin key in `.env` | Backend is the only on-chain writer; any client with admin key can impersonate |
| API ↔ Frontend session | HS256 JWT, `JWT_SECRET`, 15-minute expiry + refresh | `JWT_SECRET` rotation invalidates all sessions |

---

## 5. Data Model (canonical)

All primary keys are `UUID` (`gen_random_uuid()`). Every record carries `created_at`; mutable rows carry `updated_at`.

```
users ──┬── patients (user_id nullable: staff have no patient row)
        │     │
        │     ├── medical_records ─┬── medications
        │     │                    └── allergies
        │     │
        │     └── access_permissions (record_id nullable for patient-wide grants)
        │
        ├── audit_logs (user_id = actor)
        └── blockchain_transactions (per-contract invocations)
```

Encrypted columns: `patients.first_name`, `patients.last_name`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.notes`. Marker prefix `enc:v1:` (AES-256-GCM + random nonce, hex encoded). Legacy `enc:` (unversioned) accepted on read.

---

## 6. On-Chain Data

Nothing plaintext goes on-chain. Only:

- **Record hash** (SHA-256 of `diagnosis|treatment|notes` concatenation) → Record Registry
- **Permission tuple** (patient_id, granted_to, record_id, duration) → Access Manager
- **Access event** (user_id, record_id, action) → Audit Trail

UUIDs go on-chain in string form. This may enable low-entropy correlation; see `docs/security-model.md` for the risk note.

---

## 7. Request Lifecycle (happy path, record creation)

1. Browser POSTs `/api/records` with `Authorization: Bearer <jwt>`.
2. CORS middleware validates origin, handles OPTIONS preflight.
3. JWT middleware decodes the token, inserts `Claims` into request extensions.
4. Handler invokes `require_role(req, &["doctor","nurse"])`.
5. Service encrypts `diagnosis` / `treatment` / `notes` with AES-256-GCM; computes SHA-256 hash over plaintext.
6. SQLx `INSERT` into `medical_records` (ciphertext columns + hash).
7. SQLx `INSERT` into `medications` / `allergies` rows.
8. `blockchain_service::store_record_hash` shells out to `soroban`. Best-effort:
   - Success → update `medical_records.blockchain_tx_id`; insert into `blockchain_transactions`.
   - Failure → `eprintln!`, continue.
9. `audit_service::log_action` writes `record_created` to `audit_logs`; mirrors to Audit Trail contract if reachable.
10. Response: 201 Created with a `RecordResponse` containing decrypted plaintext.

---

## 8. What the Architecture Is *Not*

Explicitly out of scope (kept honest for thesis defense):

- **Not trustless.** A rogue backend operator can alter DB and re-hash on-chain; the existing verify path does not currently detect this (see `docs/security-model.md` §Residual Risks).
- **Not a full clinical EHR.** No scheduling, vitals, SOAP-structured notes, orders, lab/imaging. See `docs/data-flows.md` §Future Work.
- **Not multi-tenant.** One clinic, one DB, one admin key.
- **Not HA.** Single-process rate limiter; no clustering.

---

## 9. Deployment Topology (recommended)

```
[CDN / TLS terminator]   →   [Vite static bundle]      (frontend)
[TLS terminator]         →   [ehr-backend (N=1)]       (Rust binary + embedded migrations)
                             │
                             ├── [PostgreSQL 15+]       (managed preferred; backup + PITR)
                             └── [soroban-cli + key]    (admin secret in HSM / Vault, not env)
```

For capstone demo: all processes on `localhost`. For any real deployment, move `STELLAR_ADMIN_KEY` off disk; see `docs/security-model.md` §Secret Management.
