-- CLIN-4: Clinical orders — labs, imaging, prescriptions.
-- Each order is tied to a medical record and tracks a simple state machine:
-- ordered → fulfilled | cancelled.

CREATE TABLE orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id     UUID NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
    patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    kind          VARCHAR(32) NOT NULL
                  CHECK (kind IN ('lab', 'imaging', 'prescription')),
    summary       VARCHAR(255) NOT NULL,
    details       JSONB,
    status        VARCHAR(16) NOT NULL DEFAULT 'ordered'
                  CHECK (status IN ('ordered', 'fulfilled', 'cancelled')),
    ordered_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    ordered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fulfilled_at  TIMESTAMPTZ,
    cancelled_at  TIMESTAMPTZ,
    resolved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_note TEXT
);

CREATE INDEX idx_orders_record    ON orders (record_id, ordered_at DESC);
CREATE INDEX idx_orders_patient   ON orders (patient_id, ordered_at DESC);
CREATE INDEX idx_orders_open      ON orders (record_id) WHERE status = 'ordered';
