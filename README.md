# EHR Blockchain System - Technical Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Project Structure](#project-structure)
5. [Setup Instructions](#setup-instructions)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Frontend Pages](#frontend-pages)
9. [Blockchain Integration](#blockchain-integration)
10. [Security Features](#security-features)
11. [Running the Application](#running-the-application)

---

## 1. Project Overview

The EHR (Electronic Health Records) Blockchain System is a web-based application that enables secure management of medical records using blockchain technology. The system provides role-based access control for different users including patients, doctors, nurses, administrators, and auditors.

### Key Features
- Secure medical record storage with AES-256 encryption
- Blockchain-based verification and audit trails
- Role-based access control (RBAC)
- JWT-based authentication
- PostgreSQL database for persistent storage
- Stellar Soroban blockchain integration

---

## 2. Technology Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Rust | 1.94+ | Programming language |
| Actix-web | 4 | Web framework |
| SQLx | 0.7 | Database ORM |
| PostgreSQL | 15+ | Database |
| bcrypt | 0.15 | Password hashing |
| jsonwebtoken | 9 | JWT tokens |
| aes-gcm | 0.10 | Encryption |
| sha2 | 0.10 | Hashing |

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| Vite | 5 | Build tool |
| TailwindCSS | 3 | Styling |
| React Router | 6 | Routing |
| Axios | 1 | HTTP client |

---

## 3. System Architecture

### High-Level Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   Frontend  │ ──▶ │  API Server  │ ──▶ │  Database   │ ──▶ │  Blockchain  │
│   (React)   │     │   (Rust)     │     │ (PostgreSQL)│     │  (Soroban)   │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
```

### Component Interactions

1. **User Request**: React frontend sends HTTP requests to Rust backend
2. **Authentication**: JWT tokens validate user identity
3. **Business Logic**: Services process requests and apply encryption/hashing
4. **Data Storage**: PostgreSQL stores encrypted medical records
5. **Blockchain Verification**: Record hashes stored on Stellar for tamper detection

---

## 4. Project Structure

```
ehr-blockchain/
├── backend/                    # Rust API server
│   ├── src/
│   │   ├── config.rs          # Configuration management
│   │   ├── main.rs            # Application entry point
│   │   ├── handlers/           # HTTP request handlers
│   │   │   ├── auth_handler.rs
│   │   │   ├── patient_handler.rs
│   │   │   ├── record_handler.rs
│   │   │   ├── user_handler.rs
│   │   │   └── verify_handler.rs
│   │   ├── middleware/         # Request middleware
│   │   │   ├── jwt.rs
│   │   │   └── rbac.rs
│   │   ├── models/            # Data models
│   │   │   ├── mod.rs
│   │   │   ├── medical_record.rs
│   │   │   └── patient.rs
│   │   └── services/          # Business logic
│   │       ├── auth_service.rs
│   │       ├── blockchain_service.rs
│   │       ├── encryption.rs
│   │       ├── hash_service.rs
│   │       ├── patient_service.rs
│   │       └── record_service.rs
│   ├── Cargo.toml
│   └── migrations/            # Database migrations
├── frontend/                   # React application
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   │   ├── Layout.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   ├── context/           # React context
│   │   │   └── AuthContext.tsx
│   │   ├── pages/             # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Patients.tsx
│   │   │   ├── Records.tsx
│   │   │   ├── MyRecords.tsx
│   │   │   ├── Permissions.tsx
│   │   │   ├── AuditLogs.tsx
│   │   │   └── CreateStaff.tsx
│   │   ├── services/          # API services
│   │   │   └── api.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.ts
├── smart-contracts/           # Soroban smart contracts
│   ├── record_registry/
│   ├── access_manager/
│   └── audit_trail/
├── migrations/                # SQL migrations
├── .env                       # Environment variables
├── docker-compose.yml
└── Cargo.toml
```

---

## 5. Setup Instructions

### Prerequisites
- Rust 1.94+
- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### Backend Setup

1. **Install Rust**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source ~/.cargo/env
   ```

2. **Start PostgreSQL**
   ```bash
   pg_ctl -D /path/to/postgres_data -l /path/to/logfile start
   ```

3. **Create Database**
   ```bash
   psql -U postgres -c "CREATE DATABASE ehr_db;"
   psql -U postgres -c "CREATE USER ehr_admin WITH PASSWORD 'ehr_password';"
   psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE ehr_db TO ehr_admin;"
   ```

4. **Run Migrations**
   ```bash
   for f in migrations/*.sql; do psql -U ehr_admin -d ehr_db -f "$f"; done
   ```

5. **Create Admin User**
   ```bash
   # Password hash: $2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m
   psql -U ehr_admin -d ehr_db -c "INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES ('admin@ehr.com', '\$2b\$10\$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'admin', 'Admin', 'User');"
   ```

6. **Configure Environment**
   Create `.env` file in `ehr-blockchain/`:
   ```env
   SERVER_HOST=127.0.0.1
   SERVER_PORT=8080
   DATABASE_URL=postgres://ehr_admin:ehr_password@localhost:5432/ehr_db
   JWT_SECRET=super-secret-key-change-in-production
   JWT_EXPIRATION_MINUTES=15
   ENCRYPTION_KEY=32-byte-hex-key-here-replace-me
   ```

7. **Build and Run**
   ```bash
   cd ehr-blockchain
   cargo build --release
   ./target/release/ehr-backend
   ```

### Frontend Setup

1. **Install Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```

3. **Access Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080
   - Health Check: http://localhost:8080/health

---

## 6. Database Schema

### Tables

#### users
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Unique email |
| password_hash | VARCHAR(255) | Bcrypt hashed password |
| role | VARCHAR(50) | patient, doctor, nurse, admin, auditor |
| first_name | VARCHAR(100) | First name |
| last_name | VARCHAR(100) | Last name |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

#### patients
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to users |
| date_of_birth | DATE | Date of birth |
| sex | VARCHAR(20) | Gender |
| blood_type | VARCHAR(10) | Blood type |
| contact_number | VARCHAR(20) | Phone number |
| address | TEXT | Home address |
| created_at | TIMESTAMPTZ | Creation timestamp |

#### medical_records
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| patient_id | UUID | Foreign key to patients |
| created_by | UUID | Foreign key to users |
| diagnosis | TEXT | Diagnosis (encrypted) |
| treatment | TEXT | Treatment plan (encrypted) |
| notes | TEXT | Additional notes (encrypted) |
| record_hash | VARCHAR(255) | SHA-256 hash |
| blockchain_tx_id | VARCHAR(255) | Blockchain transaction ID |
| created_at | TIMESTAMPTZ | Creation timestamp |

#### medications
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| record_id | UUID | Foreign key to medical_records |
| name | VARCHAR(255) | Medication name |
| dosage | VARCHAR(100) | Dosage amount |
| frequency | VARCHAR(100) | Frequency |

#### allergies
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| record_id | UUID | Foreign key to medical_records |
| allergen | VARCHAR(255) | Allergen name |
| severity | VARCHAR(50) | Severity level |

#### access_permissions
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| patient_id | UUID | Foreign key to patients |
| granted_to | UUID | Foreign key to users |
| record_id | UUID | Foreign key to medical_records |
| permission_type | VARCHAR(50) | read, write |
| expires_at | TIMESTAMPTZ | Expiration time |
| created_at | TIMESTAMPTZ | Creation timestamp |

#### audit_logs
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to users |
| action | VARCHAR(100) | Action performed |
| resource_type | VARCHAR(50) | Resource type |
| resource_id | UUID | Resource identifier |
| ip_address | VARCHAR(50) | IP address |
| created_at | TIMESTAMPTZ | Creation timestamp |

#### blockchain_transactions
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tx_hash | VARCHAR(255) | Transaction hash |
| contract_id | VARCHAR(255) | Smart contract ID |
| action_type | VARCHAR(50) | Action type |
| payload | TEXT | Transaction payload |
| block_number | BIGINT | Block number |
| created_at | TIMESTAMPTZ | Creation timestamp |

---

## 7. API Endpoints

### Authentication

| Method | Endpoint | Description | Access |
|--------|----------|--------------|--------|
| POST | /api/auth/login | User login | Public |
| POST | /api/auth/register | User registration | Public |

### Patients

| Method | Endpoint | Description | Access |
|--------|----------|--------------|--------|
| GET | /api/patients | List all patients | Doctor, Nurse, Admin |
| POST | /api/patients | Create patient | Doctor, Admin |
| GET | /api/patients/:id | Get patient details | Doctor, Nurse, Admin |
| POST | /api/patients/with-account | Create patient with login | Admin |

### Medical Records

| Method | Endpoint | Description | Access |
|--------|----------|--------------|--------|
| GET | /api/records | List all records | Doctor, Nurse, Admin |
| POST | /api/records | Create medical record | Doctor, Nurse |
| GET | /api/patients/:id/records | Get patient records | Doctor, Nurse, Admin |

### Audit

| Method | Endpoint | Description | Access |
|--------|----------|--------------|--------|
| GET | /api/audit/logs | Get audit logs | Admin, Auditor |

### Verification

| Method | Endpoint | Description | Access |
|--------|----------|--------------|--------|
| POST | /api/verify | Verify record on blockchain | All authenticated |

### Users

| Method | Endpoint | Description | Access |
|--------|----------|--------------|--------|
| GET | /api/users | List all users | Admin |

---

## 8. Frontend Pages

| Page | URL | Access Role | Description |
|------|-----|-------------|-------------|
| Login | /login | Public | User authentication |
| Register | /register | Public | New user registration |
| Dashboard | /dashboard | All | Overview and statistics |
| Patients | /patients | Doctor, Nurse, Admin | Patient management |
| Records | /records | Doctor, Nurse, Admin | Medical records management |
| My Records | /my-records | Patient | Patient's own records |
| Permissions | /permissions | Patient | Manage access permissions |
| Audit Logs | /audit | Admin, Auditor | System audit trail |
| Create Staff | /create-staff | Admin | Create staff accounts |

---

## 9. Blockchain Integration

### How It Works

1. **Hash Generation**: When a medical record is created, a SHA-256 hash is generated from the record content
2. **Blockchain Storage**: The hash is stored on the Stellar Soroban blockchain
3. **Verification**: Later, the record can be verified by comparing its current hash with the blockchain stored hash
4. **Immutability**: If any data is modified, the hash changes and verification fails

### Smart Contracts

The system uses three Soroban smart contracts:
- **Record Registry**: Stores and verifies medical record hashes
- **Access Manager**: Manages access permissions with time-based expiration
- **Audit Trail**: Logs all access actions permanently

### Configuration

```env
RECORD_REGISTRY_CONTRACT_ID=CCL5QJQHIY2WP637HMJQ5NGIHDFK7ET2FPSDZAPPNDQSUC63HO23VNDD
ACCESS_MANAGER_CONTRACT_ID=CAQF6LCVGDOZXHXZMADFHB6EL5ELRGJAHZKFPLVEJM75PRIKQCD7XUJ2
AUDIT_TRAIL_CONTRACT_ID=CAIXRA5QQTJOF5HFMBLZA3BXFKMTIM7JVJBKYPLKDO2HJOMSSPGLOMKN
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_ADMIN_KEY=SAUZV3KJY5W7PGLK5L7OQHL3F7XCNHMPEMRDWFOM2XMR6EPIE52QAGQR
```

---

## 10. Security Features

### Authentication
- JWT tokens with 15-minute expiration
- Password hashing using bcrypt (cost factor 10)
- Token stored in localStorage with auto-refresh

### Authorization
- Role-based access control (RBAC)
- Middleware validates user roles per endpoint
- Protected routes redirect unauthorized access

### Data Protection
- AES-256-GCM encryption for sensitive data
- SHA-256 hashing for record integrity
- Database connection encryption

### Network Security
- CORS enabled for frontend access
- Input validation and sanitization
- Error handling prevents information leakage

---

## 11. Running the Application

### Complete Start Sequence

1. **Start PostgreSQL**
   ```bash
   pg_ctl -D /home/nami/postgres_data -l /home/nami/postgres_data/logfile start
   ```

2. **Start Backend** (from ehr-blockchain directory)
   ```bash
   cd /home/nami/capstone/ehr-blockchain
   ./target/release/ehr-backend
   ```

3. **Start Frontend** (from frontend directory)
   ```bash
   cd /home/nami/capstone/ehr-blockchain/frontend
   npm run dev
   ```

### Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@ehr.com | password123 |

### Verify Running Services

```bash
# Check backend
curl http://127.0.0.1:8080/health

# Check database
psql -h localhost -U ehr_admin -d ehr_db -c "SELECT 1"

# Frontend
# Open http://localhost:3000 in browser
```

---

## Appendix: Key Files Reference

### Backend Entry Point
- `backend/src/main.rs`: Application initialization, middleware setup, route configuration

### Configuration
- `backend/src/config.rs`: Environment variable parsing and configuration struct

### Services
- `auth_service.rs`: Authentication logic, JWT generation, password hashing
- `blockchain_service.rs`: Blockchain interaction via Soroban CLI
- `encryption.rs`: AES-GCM encryption/decryption functions
- `hash_service.rs`: SHA-256 hashing for record integrity

### Frontend
- `App.tsx`: Route definitions and protected route setup
- `AuthContext.tsx`: Authentication state management
- `api.ts`: API client with interceptors for auth headers

---

*Document Version: 1.0*  
*Last Updated: April 2026*