-- 034_user_phone.sql
-- Adds phone column to users. Stored on `users` (not just `patients`) because
-- staff accounts also need phone for future password-recovery flows. Nullable
-- for legacy rows; the application layer requires it for new registrations.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
