#!/usr/bin/env bash
# Re-run migrations 027-032 idempotently and record them in _sqlx_migrations.
#
# Use when the backend has been logging
#   "⚠️ Migration run skipped / failed: …"
# and endpoints 500 with "relation X does not exist".
#
# Usage:
#   PGHOST=localhost PGUSER=postgres PGDATABASE=ehr bash scripts/fix_missing_migrations.sh
# Or with inline env:
#   PGUSER=postgres PGDATABASE=ehr bash scripts/fix_missing_migrations.sh
#
# Password: set PGPASSWORD or rely on ~/.pgpass.

set -euo pipefail

: "${PGUSER:=postgres}"
: "${PGDATABASE:=ehr}"
: "${PGHOST:=localhost}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGDIR="$ROOT/migrations"

run_sql_file() {
    local version="$1"
    local description="$2"
    local file="$3"
    echo ">>> Applying $version: $description"
    psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$file"
    psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c \
        "INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) \
         VALUES ($version, '$description', NOW(), true, '\x01'::bytea, 0) \
         ON CONFLICT (version) DO UPDATE SET success = true, checksum = '\x01'::bytea;"
}

# Make sure the tracking table exists first (sqlx creates it at first migrate).
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c \
    "CREATE TABLE IF NOT EXISTS _sqlx_migrations ( \
        version       BIGINT PRIMARY KEY, \
        description   TEXT NOT NULL, \
        installed_on  TIMESTAMPTZ NOT NULL DEFAULT NOW(), \
        success       BOOLEAN NOT NULL, \
        checksum      BYTEA NOT NULL, \
        execution_time BIGINT NOT NULL \
    );"

run_sql_file 27 'appointments'        "$MIGDIR/027_appointments.sql"
run_sql_file 28 'immunizations'       "$MIGDIR/028_immunizations.sql"
run_sql_file 29 'referrals'           "$MIGDIR/029_referrals.sql"
run_sql_file 30 'attachments'         "$MIGDIR/030_attachments.sql"
run_sql_file 31 'messages'            "$MIGDIR/031_messages.sql"
run_sql_file 32 'appointment meeting' "$MIGDIR/032_appointment_meeting.sql"

echo ""
echo "Done. Current migration tail:"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c \
    "SELECT version, description, success FROM _sqlx_migrations ORDER BY version DESC LIMIT 10;"
