-- ============================================================
-- Dummy Data for EHR Blockchain System
-- ============================================================
-- This version uses gen_random_uuid() for valid UUIDs
-- and matches the actual database schema

-- Use bcrypt hash for 'password123'
-- $2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m

-- ============================================================
-- STAFF/USERS (famous TV doctor names + Filipino)
-- ============================================================

INSERT INTO users (email, password_hash, role, first_name, last_name, phone) 
VALUES 
    ('admin@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'admin', 'System', 'Administrator', '+63 900 000 0001'),
    ('house@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'doctor', 'Gregory', 'House', '+63 900 000 0002'),
    ('shepherd@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'doctor', 'Derek', 'Shepherd', '+63 900 000 0003'),
    ('grey@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'doctor', 'Meredith', 'Grey', '+63 900 000 0004'),
    ('jd@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'doctor', 'John', 'Dorian', '+63 900 000 0005'),
    ('joy@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'nurse', 'Joy', 'Mendoza', '+63 900 000 0006'),
    ('ratched@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'nurse', 'Mildred', 'Ratched', '+63 900 000 0007'),
    ('auditor@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'auditor', 'Carlos', 'Santos', '+63 900 000 0008'),
    ('audit@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'auditor', 'Maria', 'Cruz', '+63 900 000 0009')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- PATIENT USERS
-- ============================================================

INSERT INTO users (email, password_hash, role, first_name, last_name, phone) 
VALUES 
    ('juan@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Juan', 'dela Cruz', '+63 912 345 6789'),
    ('maria@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Maria', 'Garcia', '+63 918 234 5678'),
    ('jose@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Jose', 'Rizal', '+63 929 876 5432'),
    ('andi@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Andi', 'Diaz', '+63 956 123 4567'),
    ('miguel@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Miguel', 'Reyes', '+63 917 345 6789'),
    ('fatima@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Fatima', 'Cortez', '+63 928 456 7890'),
    ('pedro@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Pedro', 'Penduko', '+63 935 567 8901'),
    ('rosa@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Rosa', 'Luz', '+63 926 678 9012'),
    ('fernando@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Fernando', 'Amorsolo', '+63 937 789 0123'),
    ('lucy@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Lucy', 'Mercado', '+63 938 890 1234')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- PATIENTS
-- ============================================================

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '1985-03-15', 'male', 'O+', '+63 912 345 6789', '123 Mabini Street, Manila, Philippines'
FROM users WHERE email = 'juan@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '1990-07-22', 'female', 'A+', '+63 918 234 5678', '45 Taft Avenue, Quezon City, Philippines'
FROM users WHERE email = 'maria@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '1982-12-05', 'male', 'B+', '+63 929 876 5432', '78 Bonifacio Highway, Makati, Philippines'
FROM users WHERE email = 'jose@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '1995-05-18', 'female', 'O-', '+63 956 123 4567', '32 EDSA, Caloocan, Philippines'
FROM users WHERE email = 'andi@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '1978-09-30', 'male', 'AB+', '+63 917 345 6789', '67 Roxas Boulevard, Pasay, Philippines'
FROM users WHERE email = 'miguel@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '2000-01-12', 'female', 'A-', '+63 928 456 7890', '89 Aurora Boulevard, Cubao, Philippines'
FROM users WHERE email = 'fatima@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '1988-11-25', 'male', 'O+', '+63 935 567 8901', '101 Gilmore Highway, Quezon City, Philippines'
FROM users WHERE email = 'pedro@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '1992-04-08', 'female', 'B-', '+63 926 678 9012', '54 España Boulevard, Manila, Philippines'
FROM users WHERE email = 'rosa@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '1975-08-20', 'male', 'A+', '+63 937 789 0123', '21 Visayas Avenue, Paranaque, Philippines'
FROM users WHERE email = 'fernando@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO patients (user_id, date_of_birth, sex, blood_type, contact_number, address)
SELECT id, '1987-02-14', 'female', 'O+', '+63 938 890 1234', '88 Luzon Avenue, Manila, Philippines'
FROM users WHERE email = 'lucy@ehr.com'
ON CONFLICT DO NOTHING;

-- ============================================================
-- MEDICAL RECORDS (SOAP format: subjective, objective, assessment, plan)
-- ============================================================

-- Record 1: Juan dela Cruz - Hypertension
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id, 
    'Patient reports occasional headaches for the past week. No chest pain.',
    'BP: 145/92 mmHg, HR: 88 bpm. BMI 27.3. No peripheral edema.',
    'Essential Hypertension, Stage 1',
    'Continue Lisinopril 10mg once daily. Monitor BP at home twice daily. Return in 2 weeks.',
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'juan@ehr.com') AND d.email = 'house@ehr.com'
ON CONFLICT DO NOTHING;

-- Record 2: Maria Garcia - Diabetes
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id,
    'Feeling well. No hypoglycemia symptoms. Compliant with medications.',
    'BP: 125/80, HR: 72. HbA1c: 7.2%. Weight: 65kg.',
    'Type 2 Diabetes Mellitus, controlled',
    'Continue Metformin 500mg twice daily. Diet counseling. Recheck HbA1c in 3 months.',
    'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'maria@ehr.com') AND d.email = 'shepherd@ehr.com'
ON CONFLICT DO NOTHING;

-- Record 3: Jose Rizal - Annual Physical
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id,
    'No complaints. Maintaining healthy diet and exercise routine.',
    'BP: 120/80, HR: 68, BMI: 23.5. Complete blood count normal.',
    'Annual Physical Exam - Normal',
    'Maintain healthy lifestyle. Continue current activities. Annual checkup next year.',
    'c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'jose@ehr.com') AND d.email = 'house@ehr.com'
ON CONFLICT DO NOTHING;

-- Record 4: Andi Diaz - Prenatal
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id,
    'Feels fetal movements. No complaints. Taking prenatal vitamins regularly.',
    'Fundal height: 26cm. FHR: 140 bpm. BP: 118/76.',
    'Pregnancy, 28 weeks, G1P0',
    'Continue prenatal vitamins and iron. Next visit in 2 weeks. Ultrasound scheduled.',
    'd4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'andi@ehr.com') AND d.email = 'grey@ehr.com'
ON CONFLICT DO NOTHING;

-- Record 5: Miguel Reyes - Post-surgery
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id,
    'Minimal pain at incision site. Ambulating well.',
    'Incision clean, dry, intact. No signs of infection. Temperature normal.',
    'Appendectomy recovery, Day 7',
    'Continue Paracetamol 500mg PRN for pain. No heavy lifting for 2 weeks. Return to work in 1 week.',
    'e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'miguel@ehr.com') AND d.email = 'house@ehr.com'
ON CONFLICT DO NOTHING;

-- Record 6: Fatima Cortez - Asthma
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id,
    'Wheezing and shortness of breath since yesterday. Using inhaler frequently.',
    'Bilateral wheezes heard. RR: 22. O2 Sat: 94% on room air.',
    'Acute Asthma Exacerbation, mild-moderate',
    'Salbutamol inhaler PRN every 4 hours. Prednisone 20mg x 5 days. Follow up in 1 week.',
    'f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'fatima@ehr.com') AND d.email = 'jd@ehr.com'
ON CONFLICT DO NOTHING;

-- Record 7: Pedro Penduko - Back Pain
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id,
    'Lower back pain after lifting heavy boxes at work. Pain level 7/10.',
    'Limited lumbar flexion. Tenderness at L4-L5. X-ray: no fracture.',
    'Mechanical Low Back Pain',
    'Ibuprofen 400mg thrice daily. Hot compress. Physiotherapy 2x/week for 2 weeks.',
    'g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'pedro@ehr.com') AND d.email = 'shepherd@ehr.com'
ON CONFLICT DO NOTHING;

-- Record 8: Rosa Luz - UTI
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id,
    'Dysuria, frequency, urgency for 3 days. No fever.',
    'BP: 110/70. UA: WBC 20-25/hpf, bacteria present.',
    'Urinary Tract Infection',
    'Augmentin 625mg thrice daily x 7 days. Increase fluid intake. Follow up if symptoms persist.',
    'h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'rosa@ehr.com') AND d.email = 'joy@ehr.com'
ON CONFLICT DO NOTHING;

-- Record 9: Fernando Amorsolo - Cardiac
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id,
    'No chest pain or dyspnea. Tolerating activities of daily living well.',
    'BP: 130/85. Stress test: negative. Echo: normal LV function.',
    'Stable Angina, well-controlled',
    'Continue Aspirin 80mg daily, Metoprolol 25mg twice daily. Cardiac rehab 2x/week.',
    'i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'fernando@ehr.com') AND d.email = 'grey@ehr.com'
ON CONFLICT DO NOTHING;

-- Record 10: Lucy Mercado - Migraine
INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, plan, record_hash)
SELECT p.id, d.id,
    'Severe headache behind right eye, 2x this month. Associated with nausea and light sensitivity.',
    'Neurological exam normal. MRI: negative. Triggers: stress, lack of sleep.',
    'Migraine without aura',
    'Sumatriptan 50mg at onset. Avoid triggers. Sleep hygiene counseling. Neurology referral if frequent.',
    'j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1'
FROM patients p, users d WHERE p.user_id = (SELECT id FROM users WHERE email = 'lucy@ehr.com') AND d.email = 'jd@ehr.com'
ON CONFLICT DO NOTHING;

-- ============================================================
-- MEDICATIONS (linked to records)
-- ============================================================

-- Get record IDs and insert medications
INSERT INTO medications (record_id, name, dosage, frequency)
SELECT r.id, 'Lisinopril', '10mg', 'Once daily'
FROM medical_records r WHERE r.assessment = 'Essential Hypertension, Stage 1'
ON CONFLICT DO NOTHING;

INSERT INTO medications (record_id, name, dosage, frequency)
SELECT r.id, 'Metformin', '500mg', 'Twice daily'
FROM medical_records r WHERE r.assessment = 'Type 2 Diabetes Mellitus, controlled'
ON CONFLICT DO NOTHING;

INSERT INTO medications (record_id, name, dosage, frequency)
SELECT r.id, 'Prenatal Vitamins', '1 tablet', 'Once daily'
FROM medical_records r WHERE r.assessment LIKE 'Pregnancy%'
ON CONFLICT DO NOTHING;

INSERT INTO medications (record_id, name, dosage, frequency)
SELECT r.id, 'Paracetamol', '500mg', 'As needed'
FROM medical_records r WHERE r.assessment = 'Appendectomy recovery, Day 7'
ON CONFLICT DO NOTHING;

INSERT INTO medications (record_id, name, dosage, frequency)
SELECT r.id, 'Salbutamol Inhaler', '100mcg', 'As needed'
FROM medical_records r WHERE r.assessment LIKE 'Acute Asthma%'
ON CONFLICT DO NOTHING;

INSERT INTO medications (record_id, name, dosage, frequency)
SELECT r.id, 'Prednisone', '20mg', 'Once daily for 5 days'
FROM medical_records r WHERE r.assessment LIKE 'Acute Asthma%'
ON CONFLICT DO NOTHING;

INSERT INTO medications (record_id, name, dosage, frequency)
SELECT r.id, 'Aspirin', '80mg', 'Once daily'
FROM medical_records r WHERE r.assessment = 'Stable Angina, well-controlled'
ON CONFLICT DO NOTHING;

INSERT INTO medications (record_id, name, dosage, frequency)
SELECT r.id, 'Metoprolol', '25mg', 'Twice daily'
FROM medical_records r WHERE r.assessment = 'Stable Angina, well-controlled'
ON CONFLICT DO NOTHING;

INSERT INTO medications (record_id, name, dosage, frequency)
SELECT r.id, 'Sumatriptan', '50mg', 'At onset, max 2x/day'
FROM medical_records r WHERE r.assessment = 'Migraine without aura'
ON CONFLICT DO NOTHING;

-- ============================================================
-- ALLERGIES
-- ============================================================

INSERT INTO allergies (record_id, allergen, severity)
SELECT r.id, 'Penicillin', 'moderate'
FROM medical_records r WHERE r.patient_id = (SELECT id FROM patients WHERE user_id = (SELECT id FROM users WHERE email = 'juan@ehr.com'))
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO allergies (record_id, allergen, severity)
SELECT r.id, 'Aspirin', 'mild'
FROM medical_records r WHERE r.patient_id = (SELECT id FROM patients WHERE user_id = (SELECT id FROM users WHERE email = 'fatima@ehr.com'))
LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- ACCESS PERMISSIONS
-- ============================================================

INSERT INTO access_permissions (patient_id, granted_to, permission_type, expires_at)
SELECT p.id, d.id, 'read', NOW() + INTERVAL '30 days'
FROM patients p, users d
WHERE p.user_id = (SELECT id FROM users WHERE email = 'juan@ehr.com')
AND d.email = 'house@ehr.com'
ON CONFLICT DO NOTHING;

INSERT INTO access_permissions (patient_id, granted_to, permission_type, expires_at)
SELECT p.id, d.id, 'read', NOW() + INTERVAL '60 days'
FROM patients p, users d
WHERE p.user_id = (SELECT id FROM users WHERE email = 'maria@ehr.com')
AND d.email = 'shepherd@ehr.com'
ON CONFLICT DO NOTHING;

-- ============================================================
-- AUDIT LOGS
-- ============================================================

INSERT INTO audit_logs (user_id, action, target_record_id, ip_address, details)
SELECT d.id, 'view', r.id, '192.168.1.100', 'Viewed medical record for treatment'
FROM users d, medical_records r, patients p
WHERE d.email = 'house@ehr.com' AND r.patient_id = p.id AND p.user_id = (SELECT id FROM users WHERE email = 'juan@ehr.com')
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO audit_logs (user_id, action, target_record_id, ip_address, details)
SELECT d.id, 'create', r.id, '192.168.1.101', 'Created medical record for treatment'
FROM users d, medical_records r, patients p
WHERE d.email = 'shepherd@ehr.com' AND r.patient_id = p.id AND p.user_id = (SELECT id FROM users WHERE email = 'maria@ehr.com')
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO audit_logs (user_id, action, target_record_id, ip_address, details)
SELECT d.id, 'view', r.id, '192.168.1.102', 'Viewed patient record for treatment'
FROM users d, medical_records r, patients p
WHERE d.email = 'joy@ehr.com' AND r.patient_id = p.id AND p.user_id = (SELECT id FROM users WHERE email = 'rosa@ehr.com')
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO audit_logs (user_id, action, target_record_id, ip_address, details)
SELECT d.id, 'view', r.id, '192.168.1.50', 'Audit review of patient record'
FROM users d, medical_records r, patients p
WHERE d.email = 'auditor@ehr.com' AND r.patient_id = p.id AND p.user_id = (SELECT id FROM users WHERE email = 'juan@ehr.com')
LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- SUMMARY
-- ============================================================

SELECT 'Dummy data loaded successfully!' AS status;

SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role;