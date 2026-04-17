-- BI-7: Capture the on-chain ledger timestamp when an audit event is mirrored
-- to the Audit Trail contract. DB created_at remains as-is and is treated as
-- advisory-only when blockchain_timestamp is non-null.
ALTER TABLE audit_logs
    ADD COLUMN blockchain_timestamp BIGINT,
    ADD COLUMN blockchain_sequence  BIGINT;

COMMENT ON COLUMN audit_logs.blockchain_timestamp IS
    'Unix seconds from Stellar ledger at time of log_access() contract call. Authoritative when non-null; DB created_at is advisory.';
COMMENT ON COLUMN audit_logs.blockchain_sequence IS
    'Per-record sequence number returned by the Audit Trail contract.';
