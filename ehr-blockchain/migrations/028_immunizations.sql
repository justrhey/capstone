-- OPS-4: Immunization records. Per-patient list independent of encounter records.
CREATE TABLE IF NOT EXISTS immunizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    vaccine         VARCHAR(120) NOT NULL,
    dose_number     INTEGER CHECK (dose_number > 0),
    administered_on DATE NOT NULL,
    administered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    manufacturer    VARCHAR(120),
    lot_number      VARCHAR(60),
    site            VARCHAR(60),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_immunizations_patient ON immunizations (patient_id, administered_on DESC);
