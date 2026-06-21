-- Add missing columns to users table for phone and consent fields
-- These are required by auth_service.rs

-- phone already added in 034, but ensure consent columns exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_version TEXT DEFAULT '1.0';
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ;

-- Add consent index
CREATE INDEX IF NOT EXISTS idx_users_consent ON users(consent_version);

COMMENT ON COLUMN users.consent_version IS 'Version of privacy consent accepted';
COMMENT ON COLUMN users.consent_accepted_at TIMESTAMP WITH TIME ZONE IS 'When user accepted privacy consent';