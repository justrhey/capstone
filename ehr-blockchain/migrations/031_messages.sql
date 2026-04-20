-- EXT-1: Patient-provider secure messaging.
-- Each row is one direct message. body is encrypted with the existing enc:v1:
-- helper (see services/encryption.rs). Threads are derived client-side from
-- (sender_id, recipient_id) pairs, newest-first.

CREATE TABLE IF NOT EXISTS messages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id   UUID REFERENCES patients(id) ON DELETE SET NULL,
    body         TEXT NOT NULL,
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (sender_id <> recipient_id)
);

-- Index for thread queries: all messages between a pair, newest first.
CREATE INDEX IF NOT EXISTS idx_messages_pair_time ON messages
    (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC);

-- Index for unread lookup for a given recipient.
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (recipient_id, read_at) WHERE read_at IS NULL;
