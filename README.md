# EHR Blockchain System

![Rust](https://img.shields.io/badge/Rust-1.94%2B-orange?logo=rust)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?logo=postgresql)
![Stellar Soroban](https://img.shields.io/badge/Stellar-Soroban-7B2FF7?logo=stellar)
![License](https://img.shields.io/badge/license-MIT-green)

> **Tamper-proof medical records, backed by blockchain.**  
> A production-grade Electronic Health Records system with AES-256-GCM field encryption, Stellar Soroban smart contracts, role-based access control, and a Rust + React stack.

---

## Why This Exists

Medical records are among the most sensitive data a person has — yet most EHR systems store them in plaintext databases where **a single breach exposes millions of patients**. Even when encrypted at rest, there's no way to prove a record hasn't been altered since it was written.

This system solves both problems:

1. **Encryption at the field level** — every diagnosis, treatment, and note is AES-256-GCM encrypted before it ever touches the database. Not "encrypted at rest" (which means the database encrypts the whole disk — useless if the app or a DBA queries it). **Field-level.** The database never sees plaintext.

2. **Blockchain-notarized integrity** — every record's SHA-256 hash is stored on the **Stellar Soroban blockchain** (testnet, deployed). Any tampering changes the hash, and verification instantly fails. The blockchain doesn't store medical data — just a fingerprint proving the data hasn't changed.

---

## What Makes This Different

| Feature | This Project | Typical EHR Capstone |
|---|---|---|
| **Backend** | Rust (Actix-web) — compiled, memory-safe, async | Python/Node.js — interpreted, GC-paused |
| **Encryption** | AES-256-GCM per field — DB never sees plaintext | "Encrypted at rest" (disk-level, bypassed by query) |
| **Blockchain** | Stellar Soroban — deployed on testnet, real transactions | Anvil/Ganache — local dev node only |
| **Database** | PostgreSQL, 21 tables, full migrations with idempotency | 3–5 tables, often schemaless |
| **RBAC** | 5 roles (admin, doctor, nurse, patient, auditor) with middleware guards | 2–3 roles, often frontend-only |
| **Auth** | JWT + bcrypt (cost 10) with auto-refresh | Session cookies or basic auth |
| **Idempotency** | Duplicate blockchain submissions prevented with idempotency keys | No guard — double-submits on retry |
| **Audit Trail** | Full HIPAA-style audit logs with IP, action, resource, timestamp | "Logs" — often just a table with no structure |

---

## Screenshots

<table>
  <tr>
    <td><img src="assets/screenshots/login.jpeg" width="200" alt="Login" /></td>
    <td><img src="assets/screenshots/patient.jpeg" width="200" alt="Patient Dashboard" /></td>
    <td><img src="assets/screenshots/medical_record.jpeg" width="200" alt="Medical Record" /></td>
  </tr>
  <tr>
    <td><img src="assets/screenshots/blockchain.jpeg" width="200" alt="Blockchain Verification" /></td>
    <td><img src="assets/screenshots/appointments.jpeg" width="200" alt="Appointments" /></td>
    <td><img src="assets/screenshots/audit-log.jpeg" width="200" alt="Audit Logs" /></td>
  </tr>
</table>

---

## Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| **Rust** (1.94+) | Systems-level language with zero-cost abstractions |
| **Actix-web** 4 | High-performance async web framework |
| **SQLx** 0.7 | Compile-time checked SQL queries |
| **PostgreSQL** 15+ | Relational database with 21 tables |
| **aes-gcm** 0.10 | AES-256-GCM field-level encryption |
| **sha2** 0.10 | SHA-256 hashing for record fingerprints |
| **jsonwebtoken** 9 | JWT bearer tokens |
| **bcrypt** 0.15 | Password hashing (cost factor 10) |
| **Stellar Soroban SDK** | Smart contract interaction |

### Frontend

| Technology | Purpose |
|---|---|
| **React** 18 | Component-based UI |
| **TypeScript** 5 | Static type safety |
| **Vite** 5 | Fast development builds |
| **TailwindCSS** 3 | Utility-first styling |
| **React Router** 6 | Client-side routing |
| **Axios** | HTTP client with auth interceptors |

---

## Architecture

```
┌─────────────────────┐      ┌─────────────────────┐      ┌──────────────────┐
│                     │      │                     │      │                  │
│   React Frontend    │ HTTP │   Rust API Server   │ SQL  │   PostgreSQL     │
│   (TypeScript)      │─────▶│   (Actix-web)       │─────▶│   (21 tables)    │
│                     │      │                     │      │                  │
└─────────────────────┘      └─────────────────────┘      └──────────────────┘
                                     │                              │
                                     │ SHA-256 hash                 │ AES-256-GCM
                                     │                              │ encrypted data
                                     ▼                              ▼
                           ┌─────────────────────┐        ┌──────────────────┐
                           │                     │        │                  │
                           │  Stellar Soroban    │        │  Field-level     │
                           │  Smart Contracts    │        │  Encryption      │
                           │                     │        │                  │
                           └─────────────────────┘        └──────────────────┘
```

### Data Flow

1. **Write path**: Frontend → POST record → Backend encrypts fields (AES-256-GCM) → Stores ciphertext in PostgreSQL → Generates SHA-256 hash → Submits hash to Stellar Soroban → Returns blockchain TX ID → Frontend shows verified badge
2. **Read path**: Frontend → GET record → Backend fetches ciphertext from PostgreSQL → Decrypts with stored key → Returns plaintext to authorized role → (Optional) Verifies hash against blockchain
3. **Verify path**: Re-hashes the record content → Queries Stellar Soroban for stored hash → Matches? Green badge. Mismatch? Alert triggered.

---

## Features

### Core
- **Role-based access**: Admin, Doctor, Nurse, Patient, Auditor — each with scoped permissions enforced at the middleware level
- **Medical records**: Subjective / Objective / Assessment / Plan with encrypted diagnosis, treatment, and notes
- **Blockchain verification**: Every record gets a SHA-256 hash anchored on Stellar. Verification endpoint proves integrity.
- **Audit trail**: Every access and mutation logged with user ID, IP address, timestamp, and action type

### Clinical
- Appointments scheduling with status tracking
- Lab results & attachments
- Medications & prescriptions with dosage tracking
- Immunization records
- Allergies & problem lists
- Referrals management
- Population health analytics
- FHIR-compatible data push

### Patient
- View personal records with verified blockchain badges
- Grant/revoke doctor access to specific records
- Message providers
- Consent management

### Administrative
- Staff account creation (admin)
- User management
- System-wide audit logs
- HIPAA compliance reporting
- Data erasure queue (right-to-be-forgotten support)

---

## Quick Start

### Prerequisites

- Rust 1.94+
- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### 1. Database

```bash
psql -U postgres -c "CREATE DATABASE ehr_db;"
psql -U postgres -c "CREATE USER ehr_admin WITH PASSWORD 'ehr_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE ehr_db TO ehr_admin;"

# Run migrations
for f in migrations/*.sql; do psql -U ehr_admin -d ehr_db -f "$f"; done
```

### 2. Backend

```bash
cd ehr-blockchain

# Create .env
cat > .env << EOF
SERVER_HOST=127.0.0.1
SERVER_PORT=8080
DATABASE_URL=postgres://ehr_admin:ehr_password@localhost:5432/ehr_db
JWT_SECRET=<generate-a-secure-random-key>
JWT_EXPIRATION_MINUTES=15
ENCRYPTION_KEY=<32-byte-hex-key>
EOF

cargo build --release
./target/release/ehr-backend
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

### Default Login

| Role | Email | Password |
|---|---|---|
| Admin | admin@ehr.com | password123 |

Open **http://localhost:3000** in your browser.

---

## Architecture Decisions

### Why Rust over Python/Node.js?
Medical software has a higher bar for reliability. Rust's memory safety guarantees (no null pointers, no use-after-free, no buffer overflows) eliminate entire classes of vulnerabilities at compile time. The async model (tokio) handles thousands of concurrent connections without the GC pauses that plague Node.js under load.

### Why field-level encryption instead of disk encryption?
Disk encryption (LUKS, BitLocker) protects data at rest — but as soon as the database is running, any query can read any field in plaintext. Field-level AES-256-GCM means **the database stores only ciphertext**. Even with a full SQL dump, an attacker gets encrypted blobs, not patient data. Encryption keys never touch the database.

### Why Stellar over Ethereum?
Stellar Soroban transactions cost fractions of a cent (vs. dollars on Ethereum mainnet). For a medical records system that might submit thousands of hashes daily, Ethereum gas costs would be prohibitive. Stellar's 5-second finality is also fast enough for interactive use.

### Why hash-on-chain instead of storing data on-chain?
Medical data on a public blockchain is a HIPAA violation (and a terrible idea generally). Storing only the SHA-256 hash means:
- **No PHI ever touches the blockchain**
- Verification is still cryptographically sound
- Storage costs are minimal (32 bytes per hash)
- The system can scale to millions of records

---

## API Overview

| Endpoint | Method | Access | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | Public | Authenticate and receive JWT |
| `/api/auth/register` | POST | Public | Create patient account |
| `/api/patients` | GET | Doctor, Nurse, Admin | List patients |
| `/api/patients` | POST | Doctor, Admin | Register new patient |
| `/api/records` | GET | Doctor, Nurse, Admin | List medical records |
| `/api/records` | POST | Doctor, Nurse | Create medical record |
| `/api/patients/:id/records` | GET | Doctor, Nurse, Admin | Patient's records |
| `/api/verify` | POST | Authenticated | Verify record on blockchain |
| `/api/audit/logs` | GET | Admin, Auditor | System audit trail |
| `/api/users` | GET | Admin | Manage users |

Full API documentation is available in the [backend source](backend/src/handlers/).

---

## Blockchain Integration

### Smart Contracts

Three Soroban contracts handle on-chain logic:

| Contract | Purpose |
|---|---|
| **Record Registry** | Stores SHA-256 hashes of medical records. `store_hash()` submits, `verify_hash()` checks integrity. |
| **Access Manager** | Manages time-bound access grants. Supports grant, revoke, and expiry. |
| **Audit Trail** | Immutable log of every access event. Once written, not even admins can delete. |

### Deployed (Testnet)

```env
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

Idempotency guards prevent duplicate submissions: if a request fails (network timeout, server crash) and is retried, the blockchain service detects the existing transaction and returns the stored TX ID instead of creating a duplicate.

---

## Security

| Layer | Protection |
|---|---|
| **Transport** | TLS termination (Nginx reverse proxy) |
| **Auth** | JWT bearer tokens, 15-min expiry, auto-refresh |
| **Passwords** | bcrypt, cost factor 10 |
| **Data** | AES-256-GCM per record field |
| **Integrity** | SHA-256 hashes anchored on Stellar |
| **Access** | Role-based middleware on every endpoint |
| **Audit** | Every action logged with user, IP, timestamp |
| **CORS** | Whitelisted origins only |
| **Input** | Server-side validation and sanitization |

---

## Limitations & Roadmap

### Current
- ⚠️ No SSO / OAuth integration (JWT only)
- ⚠️ No HL7 FHIR native API (raw SQL exposed via REST)
- ⚠️ No mobile client (responsive web only)
- ⚠️ Audit logs are append-only but stored in PostgreSQL — a proper immutable store (Appendix, event-sourced DB) would be ideal for production

### Planned
- [ ] OAuth 2.0 / OpenID Connect provider integration
- [ ] Native HL7 FHIR R4 API endpoints
- [ ] React Native mobile app (offline-capable)
- [ ] Audit log shipping to immutable storage (AWS QLDB / event-sourced PostgreSQL)
- [ ] Automated disaster recovery with blockchain-backed hash reconciliation
- [ ] SMART on FHIR app launch framework

---

## Project Structure

```
ehr-blockchain/
├── backend/                       # Rust API server (Actix-web)
│   ├── src/
│   │   ├── main.rs               # Entry point, middleware, routes
│   │   ├── config.rs              # Environment config
│   │   ├── handlers/              # HTTP request handlers
│   │   │   ├── auth_handler.rs
│   │   │   ├── patient_handler.rs
│   │   │   ├── record_handler.rs
│   │   │   ├── user_handler.rs
│   │   │   └── verify_handler.rs
│   │   ├── middleware/            # JWT validation + RBAC
│   │   ├── models/                # Data models & DB queries
│   │   └── services/              # Business logic layer
│   │       ├── auth_service.rs
│   │       ├── blockchain_service.rs
│   │       ├── encryption.rs
│   │       ├── hash_service.rs
│   │       ├── patient_service.rs
│   │       └── record_service.rs
│   ├── Cargo.toml
│   └── migrations/
├── frontend/                      # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/            # Layout, ProtectedRoute, etc.
│   │   ├── context/               # AuthContext (JWT state)
│   │   ├── pages/                 #  20+ page components
│   │   ├── services/              # API client (axios)
│   │   └── App.tsx                # Routes
│   └── package.json
├── smart-contracts/               # Soroban contracts
│   ├── record_registry/
│   ├── access_manager/
│   └── audit_trail/
├── migrations/                    # SQL schema migrations
├── docker-compose.yml
└── .env
```

---

## License

MIT

---

*Built with Rust, React, and Stellar Soroban.*  
*Documentation version: 2.0 — June 2026*
