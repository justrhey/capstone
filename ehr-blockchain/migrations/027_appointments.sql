-- CLIN-5: Appointment scheduling (MVP).
-- Patients book a slot against a staff member; staff can mark completed,
-- cancelled, or no-show. Admins see everything.

CREATE TABLE appointments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id         UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    staff_user_id      UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    start_at           TIMESTAMPTZ NOT NULL,
    duration_minutes   INTEGER     NOT NULL DEFAULT 30 CHECK (duration_minutes > 0 AND duration_minutes <= 480),
    reason             TEXT,
    status             VARCHAR(16) NOT NULL DEFAULT 'scheduled'
                       CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    booked_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at        TIMESTAMPTZ,
    resolved_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    notes              TEXT
);

CREATE INDEX idx_appointments_staff_time   ON appointments (staff_user_id, start_at);
CREATE INDEX idx_appointments_patient_time ON appointments (patient_id,   start_at);
CREATE INDEX idx_appointments_scheduled
    ON appointments (start_at)
    WHERE status = 'scheduled';
