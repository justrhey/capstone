-- CMP-5: Security-incident records. Populated by the rules engine in
-- services/incident_service.rs. Admins can resolve entries from the UI.
CREATE TABLE incidents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            VARCHAR(64)  NOT NULL,
    severity        VARCHAR(16)  NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address      VARCHAR(50),
    details         TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_note TEXT
);

CREATE INDEX idx_incidents_unresolved
    ON incidents (created_at DESC)
    WHERE resolved_at IS NULL;
CREATE INDEX idx_incidents_user_id ON incidents (user_id);

COMMENT ON COLUMN incidents.kind IS
    'Machine-readable category, e.g. failed_login_burst, unusual_ip, mass_read';
COMMENT ON COLUMN incidents.severity IS
    'One of low/medium/high/critical. Drives dashboard color + notification urgency.';
