-- CLIN-2: Structured vitals / observations.
-- Linked to a patient always; linked to a specific medical record when entered
-- during a visit. Kind + value + unit is a flexible minimum viable shape
-- (temperature, bp_systolic, bp_diastolic, heart_rate, resp_rate, spo2,
-- weight_kg, height_cm, bmi, etc.).

CREATE TABLE vitals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    record_id   UUID REFERENCES medical_records(id) ON DELETE CASCADE,
    kind        VARCHAR(40) NOT NULL,
    value       DOUBLE PRECISION NOT NULL,
    unit        VARCHAR(20) NOT NULL,
    taken_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_vitals_patient_taken_at ON vitals (patient_id, taken_at DESC);
CREATE INDEX idx_vitals_record           ON vitals (record_id);
