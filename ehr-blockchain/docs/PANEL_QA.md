# Capstone Defense - Panel Q&A Preparation Guide

This document contains likely questions from the defense panel and suggested responses.

---

## Section 1: Project Overview & Architecture

### Q1: Why did you choose Rust for the backend?

**Suggested Response**:
> "We chose Rust for several reasons:
> - **Performance**: Rust is extremely fast, comparable to C/C++, which is important for healthcare systems that need to handle sensitive data quickly
> - **Memory Safety**: Rust's ownership system eliminates buffer overflows and null pointer exceptions - critical for healthcare where data integrity is paramount
> - **Actix-web**: One of the fastest web frameworks available
> - **Future-proof**: Rust is growing in adoption for systems programming and blockchain development"

---

### Q2: Why Stellar/Soroban over Ethereum or Hyperledger?

**Suggested Response**:
> "We evaluated several platforms:
> - **Ethereum**: Expensive gas fees, slow for healthcare use cases
> - **Hyperledger**: Requires permissioned network, less accessible
> - **Stellar Soroban**: Low cost, fast (3-5 second finality), built-in smart contracts, excellent developer experience
> 
> For healthcare, Soroban provides enough decentralization without the overhead. Records are hashed on-chain for immutability verification - we don't need full blockchain for every operation."

---

### Q3: Explain your system architecture in simple terms

**Suggested Response**:
> "Think of it like a secure filing cabinet:
> 1. **Frontend** (React): The desk where doctors/nurses work
> 2. **Backend** (Rust): The filing clerk who retrieves and stores records
> 3. **Database** (PostgreSQL): The physical filing cabinet
> 4. **Blockchain**: A tamper-detection seal - we don't store full records on-chain, just cryptographic fingerprints
> 
> When a record is created, we generate a hash (fingerprint) and store both in our database and on the blockchain. If someone later modifies the database record, the hash won't match, showing tampering."

---

### Q4: How do patients control their own data?

**Suggested Response**:
> "Patients have several controls:
> 1. **Access permissions**: Patients can grant/revoke access to their records (see migrations/006 and 016)
> 2. **Erasure requests**: Patients can request data deletion under GDPR/HIPAA (migration 018)
> 3. **Audit logs**: Patients can see who accessed their records
> 4. **Consent management**: Patients control consent for data sharing (migration 016)"

---

## Section 2: Blockchain Integration

### Q5: What happens if the blockchain is unavailable?

**Suggested Response**:
> "The system is designed with graceful degradation:
> 1. **Database-first**: Records are always stored in PostgreSQL first
> 2. **Anchor queue**: If blockchain fails, operations are queued for retry (anchor_queue.rs)
> 3. **Fallback mode**: The system continues working - blockchain verification becomes optional
> 4. **Audit trail**: All operations are logged regardless of blockchain status
> 
> This follows the 'defense in depth' security principle."

---

### Q6: How does the blockchain verification actually work?

**Suggested Response**:
> "Let me walk through it:
> 1. When a medical record is created, we calculate SHA-256 hash of the content
> 2. We store both the full record (encrypted) in PostgreSQL and just the hash on Soroban
> 3. To verify: `/api/verify` endpoint retrieves the record, recalculates the hash
> 4. It compares with the hash stored on the blockchain
> 5. If they match: record is authentic. If not: it was tampered with.
> 
> *(Demo this in the live demo)*"

---

### Q7: Show us the smart contract interaction

**Suggested Response**:
> "We have three Soroban smart contracts (see smart-contracts/):
> 1. **record_registry**: Stores record hashes
> 2. **access_manager**: Manages time-based access permissions
> 3. **audit_trail**: Logs all record access permanently
> 
> The backend uses soroban CLI to invoke these contracts. Let me show you..."

---

## Section 3: Security

### Q8: How is the encryption key managed?

**Suggested Response**:
> "We use AES-256-GCM encryption:
> - **Key storage**: Stored in `.env` file (not in code)
> - **Key format**: 256-bit (32 bytes) hex string
> - **Encryption**: Each field gets unique IV for semantic security
> - **Production improvement**: Would use HashiCorp Vault or AWS KMS
>
> *(Show ENCRYPTION_KEY in .env)*"

---

### Q9: What authentication/authorization do you use?

**Suggested Response**:
> "We implement multiple layers:
> 1. **JWT tokens**: 15-minute expiration with short-lived access
> 2. **Role-based access control (RBAC)**: Roles are patient, doctor, nurse, admin, auditor
> 3. **Password hashing**: bcrypt with cost factor 10
> 4. **Middleware validation**: Each endpoint checks permissions (jwt.rs, rbac.rs)
> 5. **Optional TOTP**: Two-factor authentication available (migration 019)"

---

### Q10: How do you handle HIPAA compliance?

**Suggested Response**:
> "We address key HIPAA requirements:
> 1. **Access controls**: Role-based (164.312(a)(1))
> 2. **Audit trails**: Comprehensive logging (164.528)
> 3. **Encryption**: AES-256-GCM at rest (164.312(a)(2)(iv))
> 4. **Data integrity**: Blockchain verification (164.312(c)(1))
> 5. **Patient rights**: Erasure requests, access logs (164.524)
> 6. **Breach notification**: Incident tracking (migration 017)
> 7. **Data retention**: 6-year retention policy (migration 035)"

---

## Section 4: Challenges & Lessons Learned

### Q11: What was the biggest technical challenge?

**Suggested Response**:
> "Two major challenges:
> 1. **Soroban CLI integration**: The CLI output formats varied between versions. We had to parse multiple formats (see parse_u64_tuple in blockchain_service.rs).
> 2. **Encryption consistency**: Ensuring encrypted fields decrypt correctly across different endpoints required careful attention to the encryption service.
> 
> *(Shows we had to think deeply about edge cases)*"

---

### Q12: What would you do differently with more time?

**Suggested Response**:
> "With more time, I would:
> 1. **Deploy smart contracts to testnet** and fully test the blockchain flow
> 2. **Add comprehensive test coverage** - target 70%+ instead of current ~30%
> 3. **Implement TLS** for encrypted data in transit
> 4. **Add patient portal** for self-service access requests
> 5. **Integrate with real identity providers** (e.g., Synaps, Notarize)
> 
> But given the scope, we prioritized core functionality correctly."

---

## Section 5: Code & Testing

### Q13: Show us your test coverage

**Suggested Response**:
> "We have:
> - Unit tests in each service module (encryption, auth, hash services)
> - Integration tests in tests/ directory
> - Manual testing via curl and Postman
> 
> *(Run `cargo test` to show)*
> 
> Improvements needed: More comprehensive coverage - this is noted in GAP_ANALYSIS.md"

---

### Q14: How do you handle errors?

**Suggested Response**:
> "We use a layered approach:
> 1. **Try/Result types**: Rust's type system for explicit error handling
> 2. **Error logging**: All errors logged with context
> 3. **Graceful degradation**: Blockchain failures don't break core functionality
> 4. **User-friendly messages**: API returns clear error messages
> 5. **Incident tracking**: High error rates trigger incident alerts (incident_service.rs)"

---

## Section 6: Scalability & Future

### Q15: How does this scale?

**Suggested Response**:
> "Current architecture supports:
> 1. **Horizontal scaling**: Stateless Rust backend can run multiple instances behind load balancer
> 2. **Database connection pooling**: SQLx manages connection pools
> 3. **Caching potential**: Redis can be added for frequently accessed records
> 4. **Blockchain**: Soroban handles thousands of operations per second
> 
> For a hospital system, we'd also need:
> - Read replicas for patient portal
> - CDN for attachments/images
> - Message queue for batch operations"

---

### Q16: What's the business model?

**Suggested Response**:
> "Potential models:
> 1. **SaaS**: Monthly subscription per healthcare provider
> 2. **Per-record pricing**: Based on storage/verification volume
> 3. **Infrastructure**: Provide the blockchain backend as a service
> 
> Immediate focus: Get healthcare providers to pilot"

---

## Section 7: Live Demo Questions

### Q17: (During Demo) The verification failed - what went wrong?

**Suggested Response**:
> "This is likely because:
> 1. Blockchain testnet may be slow right now - it happens
> 2. Soroban CLI may not be installed on this machine
> 
> Let me show you the database records instead, and we can discuss the fallback mode..."

---

### Q18: (During Demo) Can you show us the encrypted data?

**Suggested Response**:
> "Let me query the database to show you encrypted storage..."

---

## Tips for the Defense

1. **Know your code** - Be ready to explain any part
2. **Practice the demo** - Multiple times, with backup plans
3. **Be honest about gaps** - The GAP_ANALYSIS.md shows maturity
4. **Emphasize what works** - Focus on the demo flow
5. **Know alternatives** - Be ready to compare approaches
6. **Stay calm** - It's okay to say "I'd need to research that"

---

*Prepared for: EHR Blockchain Capstone Defense*
*Date: May 2026*