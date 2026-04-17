-- SEC-1: TOTP 2FA for staff and patients.
-- Secrets are stored encrypted with AES-256-GCM (enc:v1: prefix, see encryption.rs).
-- `totp_pending_secret` holds a generated-but-unconfirmed secret during enrollment;
-- it moves to `totp_secret` after the user verifies a code.
ALTER TABLE users
    ADD COLUMN totp_secret         TEXT,
    ADD COLUMN totp_pending_secret TEXT,
    ADD COLUMN totp_enrolled_at    TIMESTAMPTZ;

COMMENT ON COLUMN users.totp_secret IS
    'Active TOTP shared secret, encrypted. NULL = 2FA not enabled.';
COMMENT ON COLUMN users.totp_pending_secret IS
    'Generated during enroll; cleared on confirm or cancel.';
