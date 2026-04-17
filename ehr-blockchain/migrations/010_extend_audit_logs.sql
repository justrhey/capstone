ALTER TABLE audit_logs
    ADD COLUMN resource_type VARCHAR(50),
    ADD COLUMN resource_id UUID,
    ADD COLUMN ip_address VARCHAR(50);

CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
