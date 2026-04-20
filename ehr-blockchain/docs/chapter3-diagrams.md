# Chapter 3 — Methodology Diagrams

Mermaid source for every diagram called out in Chapter 3 of the capstone paper.
Render with any Mermaid-compatible tool (GitHub preview, VS Code Mermaid
extension, `mermaid.live`, mkdocs-mermaid, Notion, etc.).

---

## 3.1 Research Design — Agile Scrum Cycle

```mermaid
flowchart LR
    PB[Product Backlog<br/>31 user stories across<br/>6 epics: BI, CMP, SEC,<br/>CLIN, OPS, EXT]
    SP[Sprint Planning]
    SB[Sprint Backlog<br/>2-week scope]
    DEV[Development<br/>+ Unit Testing]
    REV[Sprint Review<br/>Demo increment]
    RETRO[Retrospective]
    INC[[Shippable Increment]]

    PB --> SP --> SB --> DEV --> REV --> RETRO
    RETRO -->|refine backlog| PB
    DEV --> INC
    RETRO -->|next sprint| SP
```

---

## 3.2 Proposed Architecture (Four-Tier)

```mermaid
flowchart TB
    subgraph CLIENT["Client Tier — Browser"]
        UI[React 18 + TypeScript SPA<br/>Tailwind UI]
    end

    subgraph APP["Application Tier — Rust"]
        API[Actix-web REST API]
        AUTH[JWT + TOTP 2FA<br/>Session Middleware]
        ENC[AES-256-GCM Encryption]
        AUD[Audit Service]
    end

    subgraph DATA["Data Tier"]
        DB[(PostgreSQL 15<br/>Encrypted PHI at rest)]
    end

    subgraph CHAIN["Blockchain Tier — Stellar Soroban Testnet"]
        RR[Record Registry<br/>Versioned hashes +<br/>Tombstones]
        AM[Access Manager<br/>Grants / Revokes]
        AT[Audit Trail<br/>Ledger-timestamped]
    end

    UI -- HTTPS/JSON --> API
    API --> AUTH
    API --> ENC --> DB
    API --> AUD
    API -- soroban CLI --> RR
    API --> AM
    AUD --> AT
    UI -. Direct verify .-> RR
```

---

## 3.3 System Requirements

### 3.3.1 Hardware Requirements

```mermaid
flowchart LR
    subgraph CLIENT["Client Devices"]
        PC[Desktop / Laptop<br/>• 4 GB RAM<br/>• Modern browser<br/>• 1280×720+]
        MOB[Tablet / Phone<br/>• iOS 14+ / Android 10+<br/>• optional]
    end

    subgraph NET["Network"]
        INT((Internet / LAN<br/>HTTPS / TLS 1.2+))
    end

    subgraph APP["Application Server"]
        SRV[Linux VM<br/>• 8 GB RAM<br/>• 4 vCPU<br/>• 50 GB SSD]
    end

    subgraph DB["Database Server"]
        DBS[PostgreSQL Host<br/>• 16 GB RAM<br/>• 4 vCPU<br/>• 100 GB SSD<br/>• Daily backups]
    end

    subgraph CHAIN["Blockchain Infra"]
        RPC[Stellar Testnet RPC<br/>soroban-testnet.stellar.org]
    end

    PC --> INT
    MOB --> INT
    INT --> SRV
    SRV --> DBS
    SRV --> RPC
```

### 3.3.2 Software Requirements

```mermaid
flowchart TB
    subgraph FE["Frontend Stack"]
        F1[React 18]
        F2[TypeScript 5]
        F3[Vite 5]
        F4[Tailwind CSS 3]
        F5[React Router 6]
        F6[Axios]
        F7[Stellar SDK JS]
    end

    subgraph BE["Backend Stack"]
        B1[Rust 1.75+]
        B2[Actix-web 4]
        B3[SQLx 0.7]
        B4[Tokio runtime]
        B5[jsonwebtoken]
        B6[totp-rs]
        B7[aes-gcm 0.10]
        B8[argon2]
    end

    subgraph CC["Smart Contracts"]
        C1[Soroban SDK 20]
        C2[Soroban CLI]
        C3[Rust no_std]
    end

    subgraph DT["Data & Infra"]
        D1[PostgreSQL 15+]
        D2[sqlx-migrate]
        D3[Stellar Testnet]
    end

    subgraph TOOLS["Dev Tools"]
        T1[Git + GitHub]
        T2[Cargo]
        T3[Node 20+ / npm]
        T4[VS Code]
    end
```

---

## 3.4 Methods and Tools

### 3.4.1 Methods — System Development Diagram (Agile/Scrum)

```mermaid
flowchart TB
    REQ[Requirements gathering<br/>compliance + clinical review] --> BL[Backlog grooming<br/>user stories + ACs]
    BL --> PRIO[Prioritize<br/>P0 → P1 → P2]
    PRIO --> SPRINT{Sprint Iteration<br/>2 weeks}

    SPRINT --> DES[Design]
    DES --> IMP[Implement]
    IMP --> TDD[TDD + Unit Tests]
    TDD -->|fail| IMP
    TDD -->|pass| INT[Integration Tests]
    INT --> CR[Code Review]
    CR --> DEMO[Sprint Demo]
    DEMO --> RET[Retrospective]

    RET -->|adjust backlog| BL
    RET -->|next sprint| SPRINT
    DEMO -->|release| REL[[Production Deploy]]
```

### 3.4.2 Tools

#### 3.4.2.1 Flowchart of the Proposed System — Record Access Workflow

```mermaid
flowchart TD
    START([User opens app]) --> LOGIN[Login Screen]
    LOGIN --> CREDS{Credentials valid?}
    CREDS -- No --> ERR[Increment failed<br/>attempts + alert]
    ERR --> LOGIN
    CREDS -- Yes --> TOTP{2FA enabled?}
    TOTP -- Yes --> OTP[Prompt TOTP code]
    OTP --> OTPV{Code valid?}
    OTPV -- No --> LOGIN
    OTPV -- Yes --> ISS
    TOTP -- No --> ISS[Issue JWT with jti<br/>write session row]
    ISS --> DASH[Role-based Dashboard]
    DASH --> ACT{User action}

    ACT -- Read record --> BG{Break-glass<br/>active?}
    BG -- Yes --> FETCH
    BG -- No --> CHK[Query Access Manager<br/>check_access on-chain]
    CHK --> GR{Grant active?}
    GR -- No --> DENY[403 Forbidden<br/>audit access_decision_deny]
    GR -- Yes --> FETCH[Fetch encrypted record]
    FETCH --> DEC[Decrypt AES-256-GCM]
    DEC --> HASH[Call verify_latest<br/>on Record Registry]
    HASH --> TAMP{Hash matches?}
    TAMP -- No --> REDBANNER[Display Tampered banner<br/>admin alert]
    TAMP -- Yes --> SHOW[Show record<br/>write audit log<br/>mirror on Audit Trail]

    ACT -- Logout --> REV[Revoke session jti]
    REV --> END([End])
    DENY --> DASH
    REDBANNER --> DASH
    SHOW --> DASH
```

#### 3.4.2.2 Data Flow Diagram — Level 1

```mermaid
flowchart LR
    P((Patient))
    S((Clinician))
    A((Admin/Auditor))

    P1[1.0<br/>Authentication]
    P2[2.0<br/>Record Management]
    P3[3.0<br/>Access Control]
    P4[4.0<br/>Blockchain Anchor]
    P5[5.0<br/>Audit Logging]
    P6[6.0<br/>Compliance Ops<br/>consent / erasure / export]

    D1[(D1 Users)]
    D2[(D2 Medical Records)]
    D3[(D3 Permissions)]
    D4[(D4 Audit Logs)]
    D5[(D5 Sessions)]
    BC[(D6 Stellar Ledger)]

    P -->|creds + TOTP| P1
    S -->|creds + TOTP| P1
    A -->|creds + TOTP| P1
    P1 <--> D1
    P1 --> D5
    P1 -->|JWT| P
    P1 -->|JWT| S
    P1 -->|JWT| A

    S -->|SOAP note| P2
    P -->|view own| P2
    P2 <--> D2
    P2 --> P3
    P3 <--> D3
    P3 <--> BC
    P2 --> P4
    P4 <--> BC

    P -->|grant/revoke| P3
    P -->|export / erasure| P6
    P6 <--> D1
    P6 <--> D2

    P2 --> P5
    P3 --> P5
    P1 --> P5
    P5 --> D4
    P5 --> BC
```

#### 3.4.2.3 Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o| PATIENTS : "has profile"
    USERS ||--o{ SESSIONS : "owns"
    USERS ||--o{ AUDIT_LOGS : "generates"
    USERS ||--o{ ACCESS_PERMISSIONS : "granted_to"
    USERS ||--o{ ERASURE_REQUESTS : "files"
    USERS ||--o{ APPOINTMENTS : "staff_for"
    USERS ||--o{ INCIDENTS : "flagged_for"

    PATIENTS ||--o{ MEDICAL_RECORDS : "has"
    PATIENTS ||--o{ PROBLEMS : "has"
    PATIENTS ||--o{ IMMUNIZATIONS : "receives"
    PATIENTS ||--o{ APPOINTMENTS : "books"
    PATIENTS ||--o{ ACCESS_PERMISSIONS : "owner_of"
    PATIENTS ||--o{ PATIENT_ASSIGNMENTS : "assigned_to"

    MEDICAL_RECORDS ||--o{ MEDICATIONS : "prescribes"
    MEDICAL_RECORDS ||--o{ ALLERGIES : "lists"
    MEDICAL_RECORDS ||--o{ VITALS : "captures"
    MEDICAL_RECORDS ||--o{ ORDERS : "includes"
    MEDICAL_RECORDS ||--o{ BLOCKCHAIN_TXNS : "anchors"

    USERS {
        uuid id PK
        string email UK
        string password_hash
        string role
        string totp_secret_enc
        string consent_version
        timestamp consent_accepted_at
        timestamp deleted_at
    }
    PATIENTS {
        uuid id PK
        uuid user_id FK
        string first_name_enc
        string last_name_enc
        date date_of_birth
        string sex
        string blood_type
        timestamp deleted_at
    }
    MEDICAL_RECORDS {
        uuid id PK
        uuid patient_id FK
        uuid created_by FK
        text subjective_enc
        text objective_enc
        text assessment_enc
        text plan_enc
        string record_hash
        string blockchain_tx_id
    }
    MEDICATIONS {
        uuid id PK
        uuid record_id FK
        string name
        string dosage
        string frequency
    }
    ALLERGIES {
        uuid id PK
        uuid record_id FK
        string allergen
        string severity
    }
    VITALS {
        uuid id PK
        uuid record_id FK
        string kind
        float value
        string unit
        timestamp taken_at
    }
    ORDERS {
        uuid id PK
        uuid record_id FK
        string kind
        string summary
        string status
    }
    PROBLEMS {
        uuid id PK
        uuid patient_id FK
        string code
        string description
        string status
        timestamp onset_at
    }
    IMMUNIZATIONS {
        uuid id PK
        uuid patient_id FK
        string vaccine
        int dose_number
        date administered_on
    }
    APPOINTMENTS {
        uuid id PK
        uuid patient_id FK
        uuid staff_user_id FK
        timestamp start_at
        int duration_minutes
        string status
    }
    ACCESS_PERMISSIONS {
        uuid id PK
        uuid patient_id FK
        uuid granted_to FK
        string permission_type
        timestamp expires_at
        string status
    }
    PATIENT_ASSIGNMENTS {
        uuid id PK
        uuid patient_id FK
        uuid staff_user_id FK
    }
    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        string resource_type
        uuid resource_id
        string ip_address
        bigint blockchain_timestamp
        bigint blockchain_sequence
    }
    SESSIONS {
        uuid id PK
        uuid user_id FK
        string device_hash
        string ip
        timestamp break_glass_until
    }
    BLOCKCHAIN_TXNS {
        uuid id PK
        uuid record_id FK
        string tx_hash
        bigint ledger_sequence
        bigint ledger_timestamp
    }
    ERASURE_REQUESTS {
        uuid id PK
        uuid user_id FK
        string status
        text reason
    }
    INCIDENTS {
        uuid id PK
        string kind
        string severity
        timestamp created_at
        timestamp resolved_at
    }
```

#### 3.4.2.4 Use Case Diagram

```mermaid
flowchart LR
    Patient(["👤 Patient"])
    Doctor(["🩺 Doctor"])
    Nurse(["💉 Nurse"])
    Admin(["⚙️ Admin"])
    Auditor(["📋 Auditor"])
    Chain(["⛓️ Stellar<br/>Blockchain"])

    subgraph SYS["EHR Blockchain System"]
        direction TB

        subgraph AUTH_UC["Authentication"]
            UC1((Register<br/>with consent))
            UC2((Login with 2FA))
            UC3((Manage sessions))
        end

        subgraph PAT_UC["Patient Self-Service"]
            UC4((View own records))
            UC5((Grant / revoke<br/>access))
            UC6((Export FHIR<br/>bundle))
            UC7((View access<br/>history))
            UC8((Request<br/>erasure))
            UC9((Verify receipt))
        end

        subgraph CLIN_UC["Clinical"]
            UC10((Create SOAP<br/>note))
            UC11((Order labs /<br/>imaging / Rx))
            UC12((Record vitals))
            UC13((Manage problem<br/>list))
            UC14((Record<br/>immunization))
            UC15((Book<br/>appointment))
        end

        subgraph ADM_UC["Administrative"]
            UC16((Manage staff))
            UC17((Manage<br/>assignments))
            UC18((Resolve erasure))
            UC19((View audit logs))
            UC20((Break-glass))
            UC21((Review<br/>incidents))
        end

        subgraph BC_UC["Blockchain"]
            UC22((Anchor<br/>record hash))
            UC23((Detect<br/>tampering))
            UC24((Browse<br/>explorer))
        end
    end

    Patient --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8 & UC9 & UC15
    Doctor --> UC2 & UC3 & UC10 & UC11 & UC12 & UC13 & UC14 & UC15 & UC20
    Nurse --> UC2 & UC3 & UC12 & UC13 & UC14 & UC15 & UC20
    Admin --> UC2 & UC3 & UC16 & UC17 & UC18 & UC19 & UC20 & UC21 & UC24
    Auditor --> UC2 & UC3 & UC19 & UC21 & UC24

    UC10 -.includes.-> UC22
    UC4 -.includes.-> UC23
    UC9 -.includes.-> UC23
    UC22 --> Chain
    UC23 --> Chain
    UC24 --> Chain
```
