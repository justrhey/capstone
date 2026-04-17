-- CMP-1: Privacy-notice consent capture.
-- `consent_version` stores which policy version the user accepted (e.g. "2026-04-17").
-- Bumping the server's CURRENT_CONSENT_VERSION forces a re-consent on next login.
-- `consent_accepted_at` is NULL for users who revoked consent.
ALTER TABLE users
    ADD COLUMN consent_version      VARCHAR(32),
    ADD COLUMN consent_accepted_at  TIMESTAMPTZ;

COMMENT ON COLUMN users.consent_version IS
    'Privacy notice version the user accepted. NULL = never accepted or revoked.';
COMMENT ON COLUMN users.consent_accepted_at IS
    'Timestamp of most recent acceptance. NULL when consent_version is NULL.';

-- Backfill: treat existing users as having accepted the current policy at migration time.
-- This keeps the demo usable; a real deployment would leave these NULL to force re-consent.
UPDATE users
    SET consent_version = '2026-04-17-backfill',
        consent_accepted_at = NOW()
    WHERE consent_version IS NULL;
