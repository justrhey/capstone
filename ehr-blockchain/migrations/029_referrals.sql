-- OPS-3: Referral workflow.
-- A doctor/nurse refers a patient to another staff member (specialist, etc).
-- Simple state machine: pending → accepted | declined | completed | cancelled.

CREATE TABLE referrals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    from_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    to_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    specialty     VARCHAR(80),
    reason        TEXT NOT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
    response_note TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referrals_patient ON referrals (patient_id, created_at DESC);
CREATE INDEX idx_referrals_to      ON referrals (to_user_id, status);
CREATE INDEX idx_referrals_from    ON referrals (from_user_id, created_at DESC);
