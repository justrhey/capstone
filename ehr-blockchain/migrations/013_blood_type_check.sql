ALTER TABLE patients
    ADD CONSTRAINT patients_blood_type_check
    CHECK (blood_type IS NULL OR blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'));
