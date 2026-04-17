-- SEC-3: Break-glass emergency access.
-- A staff user who hits the "emergency mode" toggle gets a short window
-- (30 min) during which permission checks are bypassed. Every read during
-- that window is logged with action='break_glass_read' severity='high'.
ALTER TABLE sessions
    ADD COLUMN break_glass_until  TIMESTAMPTZ,
    ADD COLUMN break_glass_reason TEXT;

COMMENT ON COLUMN sessions.break_glass_until IS
    'If set and in the future, this session may bypass the check_access gate; every read is elevated-logged.';
