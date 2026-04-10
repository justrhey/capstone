CREATE TABLE access_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    granted_to UUID NOT NULL REFERENCES users(id),
    record_id UUID REFERENCES medical_records(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired'))
);

CREATE INDEX idx_access_permissions_patient_id ON access_permissions(patient_id);
CREATE INDEX idx_access_permissions_granted_to ON access_permissions(granted_to);