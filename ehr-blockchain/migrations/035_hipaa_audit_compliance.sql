-- HIPAA Compliance: Enhanced Audit Logging
-- This migration adds proper PHI access tracking required by HIPAA §164.528

-- Add columns for HIPAA audit trail
ALTER TABLE audit_logs
    ADD COLUMN patient_id UUID REFERENCES patients(id),
    ADD COLUMN access_reason VARCHAR(255),  -- Why the access was made (treatment, billing, etc.)
    ADD COLUMN data_classification VARCHAR(50), -- Type of PHI accessed
    ADD COLUMN is_break_glass BOOLEAN DEFAULT FALSE,  -- Emergency access override
    ADD COLUMN blockchain_timestamp BIGINT,  -- Stellar ledger timestamp
    ADD COLUMN blockchain_sequence BIGINT;  -- Stellar ledger sequence

-- Indexes for efficient HIPAA compliance reporting
CREATE INDEX idx_audit_logs_patient ON audit_logs(patient_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_patient_created ON audit_logs(patient_id, created_at DESC);
CREATE INDEX idx_audit_logs_break_glass ON audit_logs(is_break_glass) WHERE is_break_glass = TRUE;

-- Data Retention Policy Table (HIPAA requires retention for 6 years)
CREATE TABLE data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_type VARCHAR(50) NOT NULL,  -- 'medical_record', 'audit_log', etc.
    retention_days INTEGER NOT NULL CHECK (retention_days > 0),
    reason TEXT,  -- Legal/regulatory basis for retention period
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Default retention policies (6 years for HIPAA compliance)
INSERT INTO data_retention_policies (data_type, retention_days, reason) VALUES
    ('medical_record', 2190, 'HIPAA §164.316(b)(2)(i) - 6 years from last activity'),
    ('audit_log', 2190, 'HIPAA §164.316(b)(2)(i) - 6 years'),
    ('blockchain_transaction', 2190, 'HIPAA §164.316(b)(2)(i) - 6 years'),
    ('patient_demographics', 2190, 'HIPAA §164.316(b)(2)(i) - 6 years'),
    ('billing_record', 2555, 'Medicare/Medicaid - 7 years'),
    ('consent_record', 2190, 'HIPAA §164.316(b)(2)(i) - 6 years');

-- PHI Access Report View (for HIPAA compliance reporting)
CREATE VIEW v_phia_access_report AS
SELECT 
    al.created_at,
    u.email AS user_email,
    u.role AS user_role,
    p.id AS patient_id,
    CONCAT(pu.first_name, ' ', pu.last_name) AS patient_name,
    al.action,
    al.resource_type,
    al.access_reason,
    al.data_classification,
    al.ip_address,
    al.is_break_glass,
    al.blockchain_timestamp,
    al.blockchain_sequence
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
LEFT JOIN patients p ON al.patient_id = p.id
LEFT JOIN users pu ON p.user_id = pu.id
WHERE al.resource_type = 'medical_record' OR al.patient_id IS NOT NULL;

-- Break-Glass Access Log View
CREATE VIEW v_break_glass_log AS
SELECT
    al.created_at,
    u.email AS user_email,
    al.action,
    al.resource_type,
    al.resource_id,
    al.ip_address,
    al.details
FROM audit_logs al
JOIN users u ON al.user_id = u.id
WHERE al.is_break_glass = TRUE;

COMMENT ON VIEW v_phia_access_report IS 'HIPAA §164.528 compliance - patient right to access log';
COMMENT ON VIEW v_break_glass_log IS 'Break-the-glass emergency access tracking';