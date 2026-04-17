-- CMP-4: Right-to-erasure (GDPR Art. 17 / HIPAA §164.526).
-- Patients request deletion; admins approve or decline.
-- Approval soft-deletes the user + their patient row(s).

CREATE TABLE erasure_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason          TEXT,
    status          VARCHAR(16) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'declined')),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_note      TEXT
);

CREATE INDEX idx_erasure_requests_pending
    ON erasure_requests (requested_at DESC)
    WHERE status = 'pending';

CREATE INDEX idx_erasure_requests_user ON erasure_requests (user_id);

-- Soft-delete markers on the subjects of erasure.
ALTER TABLE users
    ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE patients
    ADD COLUMN deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN users.deleted_at IS
    'Soft-delete marker set on approved erasure. NULL = active account.';
COMMENT ON COLUMN patients.deleted_at IS
    'Soft-delete marker. Read queries filter on deleted_at IS NULL.';
