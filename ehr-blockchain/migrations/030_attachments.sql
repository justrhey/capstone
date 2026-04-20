-- OPS-1: Lab results & imaging attachments.
-- Stored inline as BYTEA for the capstone; production would offload to S3/MinIO
-- and keep only the pointer + content hash here.

CREATE TABLE attachments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID REFERENCES orders(id) ON DELETE CASCADE,
    record_id      UUID REFERENCES medical_records(id) ON DELETE CASCADE,
    filename       VARCHAR(255) NOT NULL,
    mime_type      VARCHAR(120) NOT NULL,
    size_bytes     BIGINT NOT NULL,
    content_sha256 VARCHAR(64) NOT NULL,
    content        BYTEA NOT NULL,
    uploaded_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (size_bytes <= 10485760),            -- 10 MB cap
    CHECK (order_id IS NOT NULL OR record_id IS NOT NULL)
);

CREATE INDEX idx_attachments_order  ON attachments (order_id, uploaded_at DESC);
CREATE INDEX idx_attachments_record ON attachments (record_id, uploaded_at DESC);
