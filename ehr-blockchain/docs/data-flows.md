# Data Flow Diagrams

Sequence diagrams for the canonical flows. Rendered with Mermaid (works on GitHub and most Markdown viewers).

---

## 1. Login + Token Refresh

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant A as Actix API
    participant DB as PostgreSQL
    participant RL as RateLimiter

    U->>A: POST /api/auth/login {email, password}
    A->>RL: check(ip)
    alt >10 attempts / 60s
        A-->>U: 429 Too Many Requests
    else allowed
        A->>DB: SELECT user WHERE email=$1
        DB-->>A: user + password_hash
        A->>A: bcrypt::verify
        A->>A: HS256 sign (exp=15min)
        A-->>U: {token, user}
    end

    Note over U,A: Silent refresh every 10 minutes while active
    U->>A: POST /api/auth/refresh (Bearer old-token)
    A->>A: decode_token (manual — /api/auth/* is JWT-public)
    A->>DB: SELECT user WHERE id=$1
    DB-->>A: user
    A->>A: HS256 sign (fresh exp)
    A-->>U: {token}
```

**Notes**
- Login is rate-limited per IP (`services/rate_limit.rs`).
- Refresh requires a still-decodable token; if the old token is beyond expiry, the client must re-login.
- Frontend `AuthContext` also enforces a 60-second idle timeout independent of JWT expiry.

---

## 2. Patient-Record Create (with encryption + blockchain anchor)

```mermaid
sequenceDiagram
    autonumber
    participant U as Doctor/Nurse (browser)
    participant A as Actix API
    participant E as encryption service
    participant DB as PostgreSQL
    participant S as Soroban CLI
    participant CR as Record Registry
    participant AT as Audit Trail

    U->>A: POST /api/records {patient_id, diagnosis, treatment, notes, meds[], allergies[]}
    A->>A: require_role(doctor,nurse)
    A->>A: hash_record_content(plaintext)  —> record_hash (SHA-256)
    A->>E: encrypt_field(diagnosis), encrypt_field(treatment), encrypt_field(notes)
    E-->>A: "enc:v1:<hex>" x3
    A->>DB: INSERT medical_records (ciphertext + hash)
    DB-->>A: row
    A->>DB: INSERT medications[], allergies[]
    A->>S: soroban invoke RecordRegistry.store_hash(patient_id, record_hash)
    alt CLI available & success
        S->>CR: contract call
        CR-->>S: tx_hash
        S-->>A: tx_hash
        A->>DB: UPDATE medical_records.blockchain_tx_id
        A->>DB: INSERT blockchain_transactions (tx_hash, …)
    else CLI missing / error
        S-->>A: None  (logged to stderr, no user-visible error)
    end
    A->>DB: audit_logs INSERT (record_created, resource_id, ip)
    A->>S: soroban invoke AuditTrail.log_access(user,record,action)  (best-effort mirror)
    S->>AT: contract call (or silent no-op)
    A-->>U: 201 {record(plaintext), medications[], allergies[], blockchain_verified, tx_hash}
```

**Invariants**
- Record hash is computed **over plaintext** before encryption, so off-chain recomputation by someone with plaintext remains possible.
- Response decrypts before returning — the client never sees ciphertext.

---

## 3. Record Verification (current behavior)

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant A as Actix API
    participant DB as PostgreSQL
    participant S as Soroban CLI
    participant CR as Record Registry

    U->>A: POST /api/verify {record_id}
    A->>A: require_claims (any authenticated user)
    A->>DB: SELECT record_hash WHERE id=$1
    DB-->>A: hash
    A->>S: soroban invoke RecordRegistry.verify_hash(hash)
    alt chain reachable
        S->>CR: query
        CR-->>S: bool
        S-->>A: "true" | "false"
        A-->>U: status=intact | tampered
    else chain offline
        S-->>A: None
        A-->>U: status=unavailable
    end
```

**Known limitation (see `docs/security-model.md`).** When a record is edited, `update_record` writes a fresh hash to Record Registry. Verification therefore compares the current DB hash to a chain entry that was *also* written by the current backend, so in-place tampering by a rogue backend operator is not detected end-to-end.

**Proposed mitigation** (future work): `store_hash` should refuse to overwrite. Updates should append a new versioned hash with a tombstone to the prior version.

---

## 4. Permission Grant (patient → staff)

```mermaid
sequenceDiagram
    autonumber
    participant P as Patient (browser)
    participant A as Actix API
    participant DB as PostgreSQL
    participant S as Soroban CLI
    participant AM as Access Manager

    P->>A: POST /api/permissions {patient_id, granted_to, permission_type, expires_at}
    A->>A: require_role(patient, admin)
    A->>DB: SELECT user_id FROM patients WHERE id=$1
    DB-->>A: owner_user_id
    A->>A: verify owner_user_id == claims.sub (if patient role)
    A->>DB: INSERT access_permissions (status='active')
    DB-->>A: permission row
    A->>S: soroban invoke AccessManager.grant_access(...) (best-effort)
    alt success
        S->>AM: tx
    else failure
        Note right of S: logged only
    end
    A->>DB: audit_logs INSERT (permission_granted)
    A-->>P: 201 permission
```

**Known limitation.** The DB row is the enforcement point. No endpoint queries Access Manager's `check_access` before serving data. On-chain grant is a mirror, not a gate.

---

## 5. Audit Read

```mermaid
sequenceDiagram
    autonumber
    participant A as Admin/Auditor (browser)
    participant S as Actix API
    participant DB as PostgreSQL

    A->>S: GET /api/audit/logs?limit=100&offset=0
    S->>S: require_role(admin, auditor)
    S->>DB: SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2
    DB-->>S: rows
    S-->>A: [{id,user_id,action,resource_type,resource_id,ip_address,created_at}]
```

**Note.** Patients cannot currently see "who accessed my record" — a compliance gap tracked in `docs/compliance.md`.

---

## 6. Startup Backfill (encryption)

```mermaid
sequenceDiagram
    autonumber
    participant M as main.rs
    participant DB as PostgreSQL
    participant E as encryption

    M->>DB: Apply migrations (sqlx::migrate! — primed)
    M->>DB: SELECT id,diagnosis,treatment,notes FROM medical_records
    loop each row with a plaintext field (no enc: prefix)
        M->>E: encrypt_field(v)
        E-->>M: "enc:v1:<hex>"
        M->>DB: UPDATE medical_records SET … WHERE id=$1
    end
    M->>DB: SELECT id,first_name,last_name FROM patients
    loop each row needing encryption
        M->>E: encrypt_field(name)
        M->>DB: UPDATE patients SET … WHERE id=$1
    end
    M-->>stderr: [backfill] encrypted N rows at startup
```

Idempotent. Safe to restart; already-encrypted rows are skipped.

---

## 7. Future Flows (not yet implemented)

Stubbed here for thesis roadmap.

### 7.1 Independent patient verification (proposed)

```mermaid
sequenceDiagram
    participant P as Patient
    participant S as Any Soroban RPC
    participant CR as Record Registry

    P->>P: Recompute SHA-256 over local plaintext copy
    P->>S: contract.read(record_id) — no backend involvement
    S->>CR: state read
    CR-->>S: {stored_hash, tx_hash, block}
    S-->>P: matches? intact : tampered
```

This requires: public proof at record creation time (patient must receive `tx_hash + block_height` and the plaintext the hash was computed over).

### 7.2 Multi-sig access grant (proposed)

Grant requires on-chain signatures from both patient and provider before Access Manager sets the active bit. Prevents unilateral admin grants.

### 7.3 Tamper alert UI (proposed)

If DB record_hash ≠ latest on-chain hash for that record_id, surface a red banner on the record card and an admin alert.
