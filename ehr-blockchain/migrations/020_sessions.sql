-- SEC-2: Track active sessions so JWTs can be revoked per-device.
-- Each login creates one row. Session id doubles as the JWT's `jti` claim.
-- Middleware checks `revoked_at IS NULL` on every authenticated request.

CREATE TABLE sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address   VARCHAR(50),
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at   TIMESTAMPTZ,
    revoked_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    last_seen_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_active
    ON sessions (user_id, created_at DESC)
    WHERE revoked_at IS NULL;

COMMENT ON COLUMN sessions.id IS
    'UUID also used as the JWT jti claim so the middleware can look up the session per-request.';
COMMENT ON COLUMN sessions.revoked_at IS
    'Set when the user revokes from Settings or when an admin forces logout.';
