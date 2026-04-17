-- CLIN-3: Patient problem list (active ongoing diagnoses and conditions).
-- Distinct from per-encounter medical_records: problems persist across visits.

CREATE TABLE problems (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    code          VARCHAR(32),                     -- ICD-10 or free-text
    description   TEXT NOT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'resolved', 'inactive')),
    onset_at      DATE,
    resolved_at   DATE,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_problems_patient_status
    ON problems (patient_id, status, created_at DESC);
