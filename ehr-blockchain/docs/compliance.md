# Compliance Mapping

Mapping of implemented controls to **HIPAA** (US Health Insurance Portability and Accountability Act), **GDPR** (EU General Data Protection Regulation), and **Republic Act 10173** (Philippines Data Privacy Act 2012). Honest accounting: where the system is compliant, where it is partial, where it is missing.

**Status legend**
- ✅ Implemented
- ⚠️ Partial — claim is supportable but with caveats
- ❌ Missing

---

## 1. HIPAA — Security Rule (45 CFR §164.308–.312)

| Standard | Citation | Status | Evidence / gap |
|---|---|---|---|
| Unique user identification | §164.312(a)(2)(i) | ✅ | `users.id` UUID per account; JWT sub claim |
| Emergency access procedure | §164.312(a)(2)(ii) | ❌ | No break-glass flow; admin access is always-on |
| Automatic logoff | §164.312(a)(2)(iii) | ✅ | 60-second idle logout + 15-minute JWT (`AuthContext.tsx`) |
| Encryption and decryption | §164.312(a)(2)(iv) | ✅ | AES-256-GCM at rest (`encryption.rs`); HTTPS is deployment concern |
| Audit controls | §164.312(b) | ⚠️ | Mutations logged with IP + user + resource; **reads not logged** |
| Integrity / prevent improper alteration | §164.312(c) | ⚠️ | SHA-256 + on-chain anchor exists; re-hash-on-edit allows backend tampering (see `security-model.md` §8) |
| Person or entity authentication | §164.312(d) | ✅ | Password + JWT; no 2FA yet |
| Transmission security | §164.312(e)(1) | ⚠️ | TLS is deployment-only; code assumes reverse proxy |
| Minimum necessary | §164.502(b) | ❌ | Doctor/nurse see all patients; no assignment model |
| Access by individual (right of access) | §164.524 | ❌ | No `GET /api/me/export`; patient can view records but not download as FHIR/JSON |
| Accounting of disclosures | §164.528 | ⚠️ | Audit logs exist; patients cannot query their own access history in UI |
| Breach notification | §164.404–§164.410 | ❌ | No detection, no 60-day notification pipeline |

---

## 2. GDPR (EU 2016/679)

| Article | Requirement | Status | Evidence / gap |
|---|---|---|---|
| Art. 5(1)(c) | Data minimization | ⚠️ | Patient schema matches paper; no field-level scoping for staff |
| Art. 5(1)(f) | Integrity & confidentiality | ⚠️ | At-rest encryption yes; integrity caveat as in HIPAA §164.312(c) |
| Art. 7 | Conditions for consent | ❌ | No consent capture at registration; no record of version accepted |
| Art. 15 | Right of access | ⚠️ | UI access yes; machine-readable export no |
| Art. 16 | Right to rectification | ✅ | `PUT /api/patients/:id`, `PUT /api/records/:id` (staff-mediated) |
| Art. 17 | Right to erasure | ⚠️ | Hard delete endpoints exist; no patient-initiated request; on-chain hashes cannot be erased |
| Art. 18 | Restriction of processing | ❌ | No mechanism to "freeze" a record pending dispute |
| Art. 20 | Right to portability | ❌ | No FHIR / JSON / CSV export |
| Art. 25 | Data protection by design | ⚠️ | Encryption + RBAC from day 1; no DPIA artifact |
| Art. 30 | Records of processing | ⚠️ | Audit logs capture mutations; no central processing register |
| Art. 32 | Security of processing | ⚠️ | Good building blocks (AES, bcrypt, audit); gaps enumerated in `security-model.md` §8 |
| Art. 33 | Breach notification to authority (72h) | ❌ | Same gap as HIPAA |
| Art. 34 | Breach notification to subjects | ❌ | Same |

---

## 3. Republic Act 10173 (Data Privacy Act, Philippines)

| Section | Requirement | Status | Evidence / gap |
|---|---|---|---|
| §12 | Criteria for lawful processing | ⚠️ | Role-gated access; no consent artifact |
| §16 | Rights of the data subject | ❌ | No UI for access request, correction request history, erasure request |
| §20 | Security of personal information | ✅ | Encryption, audit, RBAC |
| §21 | Organizational security measures | ❌ | No documented DPO role, no training log |
| §22 | Accountability for transfers | ❌ | No BAA / third-party processor register |
| §26 | Mandatory breach notification to NPC | ❌ | Not implemented |

---

## 4. Control Summary Table

| Control domain | HIPAA | GDPR | DPA | Combined status |
|---|---|---|---|---|
| Authentication | 164.312(d) | Art. 32 | §20 | ✅ password + JWT, ❌ 2FA |
| Session management | 164.312(a)(2)(iii) | Art. 32 | §20 | ✅ idle + expiry + refresh |
| Authorization | 164.308(a)(3) | Art. 32 | §20 | ✅ role-based, ❌ min-necessary |
| Encryption at rest | 164.312(a)(2)(iv) | Art. 32 | §20 | ✅ AES-256-GCM |
| Encryption in transit | 164.312(e)(1) | Art. 32 | §20 | ⚠️ deployment-only |
| Audit logging | 164.312(b) | Art. 30 | §20 | ⚠️ mutations only |
| Consent | — | Art. 6, 7 | §12 | ❌ |
| Data subject access | 164.524 | Art. 15 | §16 | ⚠️ UI only |
| Data portability | — | Art. 20 | — | ❌ |
| Right to erasure | 164.526 | Art. 17 | §16 | ⚠️ partial |
| Breach notification | 164.404 | Art. 33, 34 | §26 | ❌ |
| Minimum necessary | 164.502(b) | Art. 5(1)(c) | §12 | ❌ |
| Accounting of disclosures | 164.528 | Art. 30 | §16 | ⚠️ staff-only UI |

---

## 5. Remediation Backlog (ordered by regulator priority)

These are the items that would close the most compliance gaps per unit of engineering effort.

### 5.1 Critical (blocks a real clinical deployment)
1. **Consent workflow** — on registration, capture version-stamped acceptance of a privacy notice; store in `users.consent_version_accepted` + `consent_accepted_at`; UI for revocation with audit.
2. **Patient data export** — `GET /api/me/export` returning a FHIR `Bundle` or a structured JSON of all PHI tied to the caller.
3. **Breach notification pipeline** — a detection policy (anomaly rules), an incident queue, and templated notification copy.
4. **2FA for staff** — TOTP at minimum; WebAuthn if scope allows.
5. **Patient-visible access history** — `GET /api/me/audit-history` + a tab in "My Records."

### 5.2 Expected for maturity
6. **Minimum-necessary / assignment-based access** — introduce `patient_assignments(patient_id, staff_user_id)` and filter list endpoints for doctor/nurse.
7. **Break-glass access** — a one-click "emergency access" toggle that requires a free-text justification, elevated logging, and an out-of-band alert to admin/auditor.
8. **Soft-delete with retention** — `deleted_at` columns; nightly purge after N days; on-chain tombstone.
9. **Session / device list** — a "your active sessions" tab; revoke button; per-device last-seen.
10. **IP-address privacy** — move `ip_address` out of the patient-facing audit trail; keep it server-side only.

### 5.3 Would strengthen
11. **Field-level access control** — mark diagnoses such as HIV status, psychiatric, or reproductive as "sensitive" and gate with an additional access decision.
12. **Third-party disclosure register** — `disclosures` table + BAA tracking UI for admins.
13. **On-chain correlation risk assessment** — a short artifact showing how UUIDs + hashes + timestamps could leak metadata across chains, and mitigations (salted commitments, Merkle roots).

---

## 6. Positioning for the Committee

Explicitly frame the project in defense as:

> "A **blockchain-notarized EHR for regulatory compliance**, providing strong authentication, field-level encryption, and immutable audit trails for mutations. It is not a trustless record store, and it is not a full clinical EHR. The blockchain layer delivers *regulatory traceability*; it does not replace the backend as the authoritative enforcement point."

Doing so aligns the claims with what the code does and the controls this document catalogs, which is the strongest defense against a compliance-focused reviewer.
