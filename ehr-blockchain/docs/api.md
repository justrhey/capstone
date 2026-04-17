# API Reference

Base URL (dev): `http://localhost:8080`
Auth header (all protected routes): `Authorization: Bearer <jwt>`

JWT lifetime: 15 minutes. Silent refresh every 10 minutes via `POST /api/auth/refresh`. Idle logout (frontend) at 60 seconds.

---

## 1. Conventions

| Item | Convention |
|---|---|
| IDs | `UUID` (string `xxxxxxxx-xxxx-…`) |
| Dates | ISO-8601 (`2026-04-17T13:00:00Z` for timestamps, `YYYY-MM-DD` for dates of birth) |
| Error body | plain text; format `"<variant>: <message>"` (e.g. `"Bad request: Password must be at least 8 characters"`) |
| Pagination | `?limit=N&offset=M`. Default `limit=100`, max `500`. Negative values are clamped. |
| Encryption | Diagnosis, treatment, notes, first_name, last_name are AES-256-GCM at rest; API responses carry plaintext. |

Status codes in use:

| Code | Meaning |
|---|---|
| 200 | OK / Updated / Deleted |
| 201 | Created |
| 400 | Bad request (validation) |
| 401 | Unauthorized (missing/invalid JWT) |
| 403 | Forbidden (role or ownership check) |
| 404 | Not found |
| 409 | Conflict (e.g. email already registered) |
| 429 | Too Many Requests (login rate limit) |
| 500 | Internal error |

---

## 2. Public (no JWT)

### `POST /api/auth/register`
Public patient self-registration. `role` is forced to `"patient"` server-side; any other role returns 403.

Body:
```json
{
  "email": "pat@example.com",
  "password": "at-least-8-chars",
  "role": "patient",
  "first_name": "Pat",
  "last_name": "Smith"
}
```
Returns `201` with `{ token, user }`.

Validation: email format, `first_name`/`last_name` each 1–100 chars, password ≥ 8, role whitelist.

### `POST /api/auth/login`
Body: `{ email, password }`. Returns `200` with `{ token, user }`.

Rate-limited: 10 attempts per IP per 60 seconds. Exceeding returns `429`.

### `POST /api/auth/refresh`
Header: `Authorization: Bearer <valid-not-yet-expired-token>`.
Returns `200` with `{ token }`. Decodes the passed token manually (since `/api/auth/*` bypasses JWT middleware); rejects with `401` if expired or the user no longer exists.

### `GET /` and `GET /health`
Unauthenticated liveness and metadata.

---

## 3. Authentication

All routes below require `Authorization: Bearer <jwt>`. Missing or invalid → `401`.

### `GET /api/info`
Any authenticated user. Returns the feature catalogue and full endpoint inventory as JSON (self-describing).

---

## 4. Patients

| Method | Path | Roles | Notes |
|---|---|---|---|
| `GET` | `/api/patients` | doctor, nurse, admin | Paginated. Returns decrypted names. |
| `GET` | `/api/patients/me` | any authenticated | Returns the caller's own patient row(s) by `user_id` match. |
| `POST` | `/api/patients` | doctor, admin | Creates a patient with no linked user. |
| `POST` | `/api/patients/with-account` | admin | Creates patient + `role=patient` user in a single DB transaction. |
| `GET` | `/api/patients/{id}` | any authenticated | Patient role: ownership check (`patients.user_id == claims.sub`), else `403`. |
| `PUT` | `/api/patients/{id}` | doctor, nurse, admin | Partial update; only supplied fields change. |
| `DELETE` | `/api/patients/{id}` | admin | Refuses if medical records exist (`400`). |
| `GET` | `/api/patients/{id}/records` | any authenticated | Patient role: ownership check. |
| `GET` | `/api/patients/{id}/permissions` | any authenticated | Patient role: ownership check. |

### Create request body
```json
{
  "first_name": "Ana",
  "last_name": "Reyes",
  "date_of_birth": "1990-03-15",
  "sex": "female",
  "blood_type": "A+",
  "contact_number": "+63 912 345 6789",
  "address": "123 Sampaguita St, Manila"
}
```
`blood_type` is constrained by `CHECK (blood_type IS NULL OR blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'))`.

### Create-with-account extras
Adds `email` and `password`. Returns `{ patient_id, user_id, email, first_name, last_name }`.

---

## 5. Medical Records

| Method | Path | Roles | Notes |
|---|---|---|---|
| `GET` | `/api/records` | doctor, nurse, admin | Paginated. |
| `GET` | `/api/records/{id}` | any authenticated | Returns record + medications + allergies + blockchain flags. |
| `POST` | `/api/records` | doctor, nurse | Hashes plaintext before encrypt; best-effort on-chain anchor. |
| `PUT` | `/api/records/{id}` | doctor, nurse, admin | Recomputes hash; best-effort new on-chain write. |
| `DELETE` | `/api/records/{id}` | doctor, admin | |

### Create/update body
```json
{
  "patient_id": "uuid",
  "diagnosis": "Hypertension",
  "treatment": "Lisinopril 10mg daily",
  "notes": "BP 150/95 at visit",
  "medications": [
    { "name": "Lisinopril", "dosage": "10mg", "frequency": "once daily" }
  ],
  "allergies": [
    { "allergen": "Penicillin", "severity": "severe" }
  ]
}
```

### Record response
```json
{
  "record": { "id": "uuid", "patient_id": "uuid", "diagnosis": "…", "treatment": "…", "notes": "…", "record_hash": "sha256…", "blockchain_tx_id": "…" | null, "created_at": "…" },
  "medications": [ … ],
  "allergies": [ … ],
  "blockchain_verified": true,
  "blockchain_tx_hash": "…" | null
}
```

`diagnosis`, `treatment`, `notes` are stored as `enc:v1:<hex>` and decrypted on read.

---

## 6. Verify

| Method | Path | Roles | Notes |
|---|---|---|---|
| `GET` | `/api/records/{id}/verify` | any authenticated | Lightweight — looks up record hash and queries Record Registry. |
| `POST` | `/api/verify` | any authenticated | Body `{ "record_id": "uuid" }`. Same semantics. |

Response:
```json
{
  "record_id": "uuid",
  "record_hash": "sha256…",
  "blockchain_verified": true | false,
  "status": "intact" | "tampered" | "unavailable"
}
```
`"unavailable"` means the Soroban CLI could not reach the network. See `docs/security-model.md` §8 for the known limitation on `"intact"` after in-place tampering.

---

## 7. Access Permissions

| Method | Path | Roles | Notes |
|---|---|---|---|
| `GET` | `/api/permissions` | any authenticated | Patient role: filtered to own patient row. |
| `POST` | `/api/permissions` | patient, admin | Grant; patient role: ownership check on `patient_id`. |
| `DELETE` | `/api/permissions/{id}` | patient, admin | Sets `status='revoked'`. Patient role: ownership check. |
| `GET` | `/api/patients/{id}/permissions` | any authenticated | Patient role: ownership check. |

### Grant body
```json
{
  "patient_id": "uuid",
  "granted_to": "uuid",
  "record_id": "uuid" | null,
  "permission_type": "read" | "write",
  "expires_at": "2026-05-17T00:00:00Z" | null
}
```

`permission_type` is constrained by a `CHECK` to `('read','write')`.

---

## 8. Audit

| Method | Path | Roles | Notes |
|---|---|---|---|
| `GET` | `/api/audit/logs` | admin, auditor | Paginated. Newest first. |

Row shape:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "action": "record_created" | "record_updated" | "record_deleted" | "patient_created" | "patient_account_created" | "patient_updated" | "patient_deleted" | "permission_granted" | "permission_revoked" | "user_updated" | "user_deleted" | "staff_created",
  "resource_type": "medical_record" | "patient" | "access_permission" | "user" | null,
  "resource_id": "uuid" | null,
  "ip_address": "127.0.0.1" | null,
  "created_at": "…"
}
```

---

## 9. Users

| Method | Path | Roles | Notes |
|---|---|---|---|
| `GET` | `/api/users` | admin | Paginated. Returns full `User` rows. |
| `GET` | `/api/users/staff` | any authenticated | Lightweight directory: id, email, first_name, last_name, role — for Permissions UI. |
| `POST` | `/api/users/staff` | admin | Admin-gated staff creation. Rejects `role=patient`. |
| `PUT` | `/api/users/{id}` | admin | Partial update (first_name, last_name, email). Audits as `user_updated`. |
| `DELETE` | `/api/users/{id}` | admin | Audits as `user_deleted`. |
| `GET` | `/api/info` | any authenticated | Self-description (feature flags + endpoint list). |

### Create staff body
```json
{
  "email": "doc@clinic.com",
  "password": "≥8 chars",
  "role": "doctor" | "nurse" | "auditor" | "admin",
  "first_name": "Alex",
  "last_name": "Cruz"
}
```

---

## 10. Error Examples

| Scenario | Code | Body |
|---|---|---|
| Bad email format | 400 | `"Bad request: Invalid email format"` |
| Weak password | 400 | `"Bad request: Password must be at least 8 characters"` |
| Patient tries to list patients | 403 | `"Forbidden: Insufficient permissions"` |
| Non-patient accesses `/api/patients/me` | 200 | Empty array (they have no patient row) |
| Patient requests another's record | 403 | `"Forbidden: Not your record"` |
| Login rate exceeded | 429 | `"Too many requests: Too many login attempts. Try again in a minute."` |
| Delete patient with records | 400 | `"Bad request: Cannot delete patient with existing medical records. Delete records first."` |
| Duplicate staff email | 409 | `"Conflict: Email already registered"` |
| Chain unreachable on verify | 200 | `{ "status": "unavailable" }` |

---

## 11. Quick cURL Smoke Test

```bash
# register a patient
curl -s -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"pat@example.com","password":"correcthorse","role":"patient","first_name":"Pat","last_name":"Smith"}'

# login
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"pat@example.com","password":"correcthorse"}' \
  | python -c 'import sys,json; print(json.load(sys.stdin)["token"])')

# fetch own patient row (may be empty if not linked)
curl -s http://localhost:8080/api/patients/me -H "Authorization: Bearer $TOKEN"

# paginate records (forbidden for patient role — expect 403)
curl -s http://localhost:8080/api/records?limit=10 -H "Authorization: Bearer $TOKEN"
```

---

## 12. Versioning

This API is **v0**. No `/v1` prefix exists because the client and server ship together. Breaking changes will be noted in `CHANGELOG.md` (not yet written) and coordinated across both codebases.
