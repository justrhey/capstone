-- patients.first_name and last_name are now encrypted via AES-256-GCM (enc: prefix).
-- The legacy encrypted_pii BYTEA blob is no longer used.
ALTER TABLE patients DROP COLUMN IF EXISTS encrypted_pii;
