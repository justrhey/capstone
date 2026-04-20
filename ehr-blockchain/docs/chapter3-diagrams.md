# Chapter 3 — Methodology Diagrams

Mermaid source for every diagram called out in Chapter 3. Simplified for
print: each diagram focuses on the concepts a reader needs to understand
the method, not every implementation detail. Render with GitHub preview,
VS Code Mermaid extension, or `mermaid.live` and export SVG at ≤ 6.5"
width for insertion into the paper.

---

## 3.1 Research Design — Agile

```mermaid
flowchart TB
    PB[Product Backlog]
    SP[Sprint Planning]
    DEV[Development<br/>+ Testing]
    REV[Sprint Review]
    INC[[Increment]]

    PB --> SP --> DEV --> REV
    DEV --> INC
    REV -->|next sprint| PB
```

---

## 3.2 Proposed Architecture

```mermaid
flowchart TB
    UI[Web Client<br/>React SPA]

    subgraph APP["Application Server (Rust)"]
        API[REST API<br/>+ Auth + Encryption + Audit]
    end

    DB[(PostgreSQL<br/>Encrypted at rest)]

    subgraph CHAIN["Stellar Soroban"]
        RR[Record Registry]
        AM[Access Manager]
        AT[Audit Trail]
    end

    UI --> API
    API --> DB
    API --> RR
    API --> AM
    API --> AT
    UI -. independent verify .-> RR
```

---

## 3.3 System Requirements

### 3.3.1 Hardware

```mermaid
flowchart TB
    CLIENT[Client Device<br/>modern browser]
    NET((Internet · TLS))
    SRV[Application Server<br/>Linux VM]
    DB[(Database Server<br/>PostgreSQL)]
    CHAIN[(Stellar Testnet)]

    CLIENT --> NET --> SRV
    SRV --> DB
    SRV --> CHAIN
```

### 3.3.2 Software d
 
```mermaid
flowchart TB
    subgraph FE["Frontend"]
        F1[React + TypeScript]
        F2[Tailwind CSS]
        F3[Vite]
    end

    subgraph BE["Backend"]
        B1[Rust · Actix-web]
        B2[SQLx · PostgreSQL]
        B3[JWT + TOTP 2FA]
    end

    subgraph SC["Smart Contracts"]
        C1[Soroban SDK · Rust]
    end

    subgraph INFRA["Infrastructure"]
        I1[PostgreSQL 15+]
        I2[Stellar Testnet]
    end
```

---

## 3.4 Methods and Tools

### 3.4.1 System Development Method (Agile)

```mermaid
flowchart TB
    REQ[Requirements] --> DES[Design]
    DES --> IMP[Implement]
    IMP --> TEST[Test]
    TEST -->|fail| IMP
    TEST -->|pass| REV[Review]
    REV -->|next sprint| REQ
    REV --> REL[[Release]]
```

### 3.4.2 Tools

#### 3.4.2.1 Flowchart — Access a Record

```mermaid
flowchart TD
    START([User opens app]) --> LOGIN[Login + 2FA]
    LOGIN --> OK{Authenticated?}
    OK -- No --> LOGIN
    OK -- Yes --> REQ[Request record]
    REQ --> ACC{Access granted<br/>on blockchain?}
    ACC -- No --> DENY[Deny · log event]
    ACC -- Yes --> FETCH[Fetch + decrypt record]
    FETCH --> VERIFY{On-chain hash<br/>matches?}
    VERIFY -- No --> TAMPER[Flag as tampered]
    VERIFY -- Yes --> SHOW[Display record]
    SHOW --> AUDIT[Write audit log]
    DENY --> END([End])
    TAMPER --> END
    AUDIT --> END
```

#### 3.4.2.2 Data Flow Diagram

```mermaid
flowchart TB
    P((Patient))
    S((Clinician))
    A((Admin))

    AUTH[Authentication]
    REC[Record Management]
    PERM[Access Control]
    AUD[Audit + Blockchain Anchor]

    D1[(Users)]
    D2[(Medical Records)]
    D3[(Permissions)]
    D4[(Audit Logs)]
    BC[(Stellar Ledger)]

    P --> AUTH
    S --> AUTH
    A --> AUTH
    AUTH <--> D1

    S --> REC
    P --> REC
    REC <--> D2
    REC --> PERM
    PERM <--> D3
    PERM <--> BC
    REC --> AUD
    AUD --> D4
    AUD --> BC
```

#### 3.4.2.3 Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o| PATIENTS : "has profile"
    USERS ||--o{ AUDIT_LOGS : "generates"
    USERS ||--o{ ACCESS_PERMISSIONS : "granted to"

    PATIENTS ||--o{ MEDICAL_RECORDS : "has"
    PATIENTS ||--o{ ACCESS_PERMISSIONS : "owner of"

    MEDICAL_RECORDS ||--o{ MEDICATIONS : "prescribes"
    MEDICAL_RECORDS ||--o{ ALLERGIES : "lists"
    MEDICAL_RECORDS ||--o{ BLOCKCHAIN_TXNS : "anchored by"

    USERS {
        uuid id PK
        string email
        string role
        string password_hash
    }
    PATIENTS {
        uuid id PK
        uuid user_id FK
        string name_enc
        date date_of_birth
    }
    MEDICAL_RECORDS {
        uuid id PK
        uuid patient_id FK
        text soap_enc
        string record_hash
    }
    MEDICATIONS {
        uuid id PK
        uuid record_id FK
        string name
    }
    ALLERGIES {
        uuid id PK
        uuid record_id FK
        string allergen
    }
    ACCESS_PERMISSIONS {
        uuid id PK
        uuid patient_id FK
        uuid granted_to FK
        timestamp expires_at
    }
    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        timestamp created_at
    }
    BLOCKCHAIN_TXNS {
        uuid id PK
        uuid record_id FK
        string tx_hash
        bigint ledger_seq
    }
```

#### 3.4.2.4 Use Case Diagram

```mermaid
flowchart TB
    Patient(["Patient"])
    Doctor(["Doctor / Nurse"])
    Admin(["Admin"])
    Auditor(["Auditor"])

    subgraph SYS["EHR Blockchain System"]
        direction TB
        UC1((Log in with 2FA))
        UC2((View own records))
        UC3((Grant / revoke<br/>access))
        UC4((Create clinical<br/>record))
        UC5((Order labs / Rx))
        UC6((Book appointment))
        UC7((Verify record<br/>integrity))
        UC8((Manage users<br/>+ assignments))
        UC9((Review audit<br/>logs + incidents))
        UC10((Request / resolve<br/>data erasure))
        UC11((Export FHIR<br/>bundle))
        UC12((Anchor hash<br/>on blockchain))
    end

    Patient --> UC1
    Patient --> UC2
    Patient --> UC3
    Patient --> UC6
    Patient --> UC7
    Patient --> UC10
    Patient --> UC11

    Doctor --> UC1
    Doctor --> UC4
    Doctor --> UC5
    Doctor --> UC6
    Doctor --> UC7

    Admin --> UC1
    Admin --> UC8
    Admin --> UC9
    Admin --> UC10

    Auditor --> UC1
    Auditor --> UC9
    Auditor --> UC7

    UC4 -.includes.-> UC12
    UC2 -.includes.-> UC7
```
