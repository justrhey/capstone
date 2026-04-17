-- SEC-4: HIPAA §164.502(b) minimum-necessary enforcement.
-- Doctors and nurses see only patients they have been assigned to; admins see all.
-- Break-glass (SEC-3) bypasses this filter and elevates the audit log.

CREATE TABLE patient_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    removed_at    TIMESTAMPTZ,
    removed_by    UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_patient_assignments_active
    ON patient_assignments (patient_id, staff_user_id)
    WHERE removed_at IS NULL;

CREATE INDEX idx_patient_assignments_staff
    ON patient_assignments (staff_user_id)
    WHERE removed_at IS NULL;
