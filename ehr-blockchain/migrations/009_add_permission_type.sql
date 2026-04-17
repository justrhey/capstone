ALTER TABLE access_permissions
    ADD COLUMN permission_type VARCHAR(50) NOT NULL DEFAULT 'read'
    CHECK (permission_type IN ('read', 'write'));

CREATE INDEX idx_access_permissions_permission_type ON access_permissions(permission_type);
