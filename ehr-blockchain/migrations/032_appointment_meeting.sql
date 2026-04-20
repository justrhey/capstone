-- EXT-3: Telehealth video embed.
-- Optional meeting URL stamped on the appointment. Auto-populated on booking
-- with a Jitsi-Meet room per appointment (no backend signaling needed).

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS meeting_url TEXT,
    ADD COLUMN IF NOT EXISTS is_telehealth BOOLEAN NOT NULL DEFAULT FALSE;
