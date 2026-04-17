-- CLIN-1: SOAP-structured medical records (Subjective / Objective /
-- Assessment / Plan). Replaces the flat diagnosis/treatment/notes shape.
--
-- Encrypted-at-rest: same enc:v1: prefix pattern as the legacy fields.
-- Existing ciphertext migrates by COLUMN RENAME — no re-encryption needed.

ALTER TABLE medical_records
    ADD COLUMN subjective TEXT,
    ADD COLUMN objective  TEXT,
    ADD COLUMN assessment TEXT,
    ADD COLUMN "plan"     TEXT;

-- Carry legacy data into SOAP slots for continuity:
--   diagnosis  → assessment
--   treatment  → plan
--   notes      → objective (observations/findings fit here)
-- The data is already encrypted; we're moving ciphertext between columns.
UPDATE medical_records
    SET assessment = diagnosis,
        "plan"     = treatment,
        objective  = notes
    WHERE assessment IS NULL
      AND "plan"     IS NULL
      AND objective  IS NULL
      AND subjective IS NULL;

-- Drop the legacy columns.
ALTER TABLE medical_records
    DROP COLUMN diagnosis,
    DROP COLUMN treatment,
    DROP COLUMN notes;

COMMENT ON COLUMN medical_records.subjective IS
    'Patient-reported symptoms, history. Encrypted (enc:v1:).';
COMMENT ON COLUMN medical_records.objective IS
    'Examination findings, vitals narrative. Encrypted.';
COMMENT ON COLUMN medical_records.assessment IS
    'Clinical judgment / diagnosis. Encrypted.';
COMMENT ON COLUMN medical_records."plan" IS
    'Treatment plan, follow-up. Encrypted.';
