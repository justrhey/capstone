-- Dummy Data for EHR Blockchain System
-- Run this after migrations to populate demo data

-- Use bcrypt hash for 'password123'
-- Generated with cost factor 10
-- Hash: $2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m
-- This hash corresponds to: password123

-- ============================================================
-- ADMIN USERS (using fictional/famous names)
-- ============================================================

-- Admin account
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('11111111-1111-1111-1111-111111111111', 'admin@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'admin', 'System', 'Administrator')
ON CONFLICT (email) DO NOTHING;

-- Dr. Gregory House (fictional TV doctor - famous!)
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('22222222-2222-2222-2222-222222222222', 'house@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'doctor', 'Gregory', 'House')
ON CONFLICT (email) DO NOTHING;

-- Dr. Derek Shepherd (Grey's Anatomy - fictional celebrity)
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('33333333-3333-3333-3333-333333333333', 'shepherd@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'doctor', 'Derek', 'Shepherd')
ON CONFLICT (email) DO NOTHING;

-- Dr. Meredith Grey (Grey's Anatomy)
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('44444444-4444-4444-4444-444444444444', 'grey@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'doctor', 'Meredith', 'Grey')
ON CONFLICT (email) DO NOTHING;

-- Dr. John Dorian (Scrubs - fictional)
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('55555555-5555-5555-5555-555555555555', 'jd@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'doctor', 'John', 'Dorian')
ON CONFLICT (email) DO NOTHING;

-- Nurse Joy (fictional - inspired by Nurse Joy from Pokemon but Filipino name)
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('66666666-6666-6666-6666-666666666666', 'joy@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'nurse', 'Joy', 'Mendoza')
ON CONFLICT (email) DO NOTHING;

-- Nurse Ratched (One Flew Over the Cuckoo's Nest - fictional)
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('77777777-7777-7777-7777-777777777777', 'ratched@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'nurse', 'Mildred', 'Ratched')
ON CONFLICT (email) DO NOTHING;

-- Auditor (fictional Filipino name)
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('88888888-8888-8888-8888-888888888888', 'auditor@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'auditor', 'Carlos', 'Santos')
ON CONFLICT (email) DO NOTHING;

-- Second auditor
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('99999999-9999-9999-9999-999999999999', 'audit@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'auditor', 'Maria', 'Cruz')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- PATIENTS (using Filipino names)
-- ============================================================

-- Juan dela Cruz (common Filipino name)
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '1985-03-15', 'male')
ON CONFLICT DO NOTHING;

-- Maria Garcia
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', '1990-07-22', 'female')
ON CONFLICT DO NOTHING;

-- Jose Rizal (historical figure name)
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('ccccccc-cccc-cccc-cccc-cccccccccc', '33333333-3333-3333-3333-333333333333', '1982-12-05', 'male')
ON CONFLICT DO NOTHING;

-- Andrea "Andi" Diaz
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('ddddddd-dddd-dddd-dddd-dddddddddd', '44444444-4444-4444-4444-444444444444', '1995-05-18', 'female')
ON CONFLICT DO NOTHING;

-- Miguel Reyes
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('eeeeeee-eeee-eeee-eeee-eeeeeeeeee', '55555555-5555-5555-5555-555555555555', '1978-09-30', 'male')
ON CONFLICT DO NOTHING;

-- Fatima Cortez
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('fffffff-ffff-ffff-ffff-ffffffff', '66666666-6666-6666-6666-666666666666', '2000-01-12', 'female')
ON CONFLICT DO NOTHING;

-- Pedro Penduko (folk hero name)
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('ggggggg-gggg-gggg-gggg-ggggggggggg', '77777777-7777-7777-7777-777777777777', '1988-11-25', 'male')
ON CONFLICT DO NOTHING;

-- Rosa Luz
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('hhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', '88888888-8888-8888-8888-888888888888', '1992-04-08', 'female')
ON CONFLICT DO NOTHING;

-- Fernando Amorsolo (after the famous painter)
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('iiiiiii-iiii-iiii-iiii-iiiiiiiiii', '99999999-9999-9999-9999-999999999999', '1975-08-20', 'male')
ON CONFLICT DO NOTHING;

-- Lucia "Lucy" Mercado
INSERT INTO patients (id, user_id, date_of_birth, sex)
VALUES ('jjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', '10101010-1010-1010-1010-101010101010', '1987-02-14', 'female')
ON CONFLICT DO NOTHING;

-- Create user accounts for patients so they can login
INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'juan@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Juan', 'dela Cruz')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'maria@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Maria', 'Garcia')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('ccccccc-cccc-cccc-cccc-cccccccccc', 'jose@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Jose', 'Rizal')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('ddddddd-dddd-dddd-dddd-dddddddddd', 'andi@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Andi', 'Diaz')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('eeeeeee-eeee-eeee-eeee-eeeeeeeeee', 'miguel@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Miguel', 'Reyes')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('fffffff-ffff-ffff-ffff-ffffffff', 'fatima@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Fatima', 'Cortez')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('ggggggg-gggg-gggg-gggg-ggggggggggg', 'pedro@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Pedro', 'Penduko')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('hhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', 'rosa@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Rosa', 'Luz')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('iiiiiii-iiii-iiii-iiii-iiiiiiiiii', 'fernando@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Fernando', 'Amorsolo')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, first_name, last_name) 
VALUES ('jjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', 'lucy@ehr.com', '$2b$10$wDBNfQ8V9DTtgj8utSedFOJcF3IfVUgAO6kfA1N5Rg7PY6VXTvd.m', 'patient', 'Lucy', 'Mercado')
ON CONFLICT (email) DO NOTHING;

-- Update patients to reference their user accounts
UPDATE patients SET user_id = 'aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE id = 'aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE patients SET user_id = 'bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE id = 'bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
UPDATE patients SET user_id = 'ccccccc-cccc-cccc-cccc-cccccccccc' WHERE id = 'ccccccc-cccc-cccc-cccc-cccccccccc';
UPDATE patients SET user_id = 'ddddddd-dddd-dddd-dddd-dddddddddd' WHERE id = 'ddddddd-dddd-dddd-dddd-dddddddddd';
UPDATE patients SET user_id = 'eeeeeee-eeee-eeee-eeee-eeeeeeeeee' WHERE id = 'eeeeeee-eeee-eeee-eeee-eeeeeeeeee';
UPDATE patients SET user_id = 'fffffff-ffff-ffff-ffff-ffffffff' WHERE id = 'fffffff-ffff-ffff-ffff-ffffffff';
UPDATE patients SET user_id = 'ggggggg-gggg-gggg-gggg-ggggggggggg' WHERE id = 'ggggggg-gggg-gggg-gggg-ggggggggggg';
UPDATE patients SET user_id = 'hhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh' WHERE id = 'hhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh';
UPDATE patients SET user_id = 'iiiiiii-iiii-iiii-iiii-iiiiiiiiii' WHERE id = 'iiiiiii-iiii-iiii-iiii-iiiiiiiiii';
UPDATE patients SET user_id = 'jjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj' WHERE id = 'jjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj';

-- ============================================================
-- MEDICAL RECORDS (sample SOAP notes)
-- ============================================================

-- Record 1: Juan dela Cruz - Hypertension follow-up
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0101-0101-0101-0101-010101010101',
    'aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    'Essential Hypertension, Stage 1',
    'Lisinopril 10mg once daily, monitor BP at home',
    'Patient reports occasional headaches. BP today 145/92. Continue current medication.',
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
);

-- Record 2: Maria Garcia - Diabetes management
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0102-0102-0102-0102-010101010102',
    'bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '33333333-3333-3333-3333-333333333333',
    'Type 2 Diabetes Mellitus',
    'Metformin 500mg twice daily with meals',
    'HbA1c improved to 7.2%. Continue current regimen.',
    'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a'
);

-- Record 3: Jose Rizal - Physical exam
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0103-0103-0103-0103-010101010103',
    'ccccccc-cccc-cccc-cccc-cccccccccc',
    '22222222-2222-2222-2222-222222222222',
    'Annual Physical Exam - Normal',
    'No medications needed. Maintain healthy lifestyle.',
    'Overall health good. BMI 23.5. BP 120/80. Labs within normal limits.',
    'c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1'
);

-- Record 4: Andi Diaz - Prenatal check
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0104-0104-0104-0104-010101010104',
    'ddddddd-dddd-dddd-dddd-dddddddddd',
    '44444444-4444-4444-4444-444444444444',
    'Pregnancy, 28 weeks, G1P0',
    'Prenatal vitamins, iron supplements',
    'Baby heartbeat 140 bpm. Fundal height 26cm. Next visit in 2 weeks.',
    'd4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b'
);

-- Record 5: Miguel Reyes - Post-surgery follow-up
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0105-0105-0105-0105-010101010105',
    'eeeeeee-eeee-eeee-eeee-eeeeeeeeee',
    '22222222-2222-2222-2222-222222222222',
    'Appendectomy recovery, Day 7',
    'Paracetamol 500mg as needed for pain',
    'Incision healing well. No signs of infection. Can resume light activities.',
    'e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2'
);

-- Record 6: Fatima Cortez - Asthma acute
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0106-0106-0106-0106-010101010106',
    'fffffff-ffff-ffff-ffff-ffffffff',
    '55555555-5555-5555-5555-555555555555',
    'Acute Asthma Exacerbation, mild',
    'Salbutamol inhaler PRN, Prednisone 20mg for 5 days',
    'Wheezing on exam. Given bronchodilator. Patient responds well.',
    'f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2c'
);

-- Record 7: Pedro Penduko - Back pain
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0107-0107-0107-0107-010101010107',
    'ggggggg-gggg-gggg-gggg-ggggggggggg',
    '33333333-3333-3333-3333-333333333333',
    'Mechanical Low Back Pain',
    'NSAIDs, physiotherapy, hot compress',
    'Work-related strain. X-ray negative. Start PT next week.',
    'g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2c3'
);

-- Record 8: Rosa Luz - UTI
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0108-0108-0108-0108-010101010108',
    'hhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh',
    '66666666-6666-6666-6666-666666666666',
    'Urinary Tract Infection',
    'Augmentin 625mg thrice daily for 7 days',
    'Dysuria for 3 days. UA shows WBC 20-25/hpf. Start antibiotics.',
    'h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2c3d'
);

-- Record 9: Fernando Amorsolo - Cardiac check
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0109-0109-0109-0109-010101010109',
    'iiiiiii-iiii-iiii-iiii-iiiiiiiiii',
    '44444444-4444-4444-4444-444444444444',
    'Stable Angina, controlled',
    'Aspirin 80mg daily, Metoprolol 25mg twice daily',
    'Stress test negative. Cardiac enzymes normal. Continue current meds.',
    'i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2c3d4'
);

-- Record 10: Lucy Mercado - Migraine
INSERT INTO medical_records (id, patient_id, created_by, diagnosis, treatment, notes, record_hash)
VALUES (
    'rec0110-0110-0110-0110-010101010110',
    'jjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj',
    '55555555-5555-5555-5555-555555555555',
    'Migraine without aura',
    'Sumatriptan 50mg PRN, avoid triggers',
    'Frequency 2x/month. MRI negative. Identify triggers: stress, lack of sleep.',
    'j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2c3d4e'
);

-- ============================================================
-- MEDICATIONS (linked to records)
-- ============================================================

INSERT INTO medications (id, record_id, name, dosage, frequency)
VALUES ('med0101-0101-0101-0101-010101010101', 'rec0101-0101-0101-0101-010101010101', 'Lisinopril', '10mg', 'Once daily');

INSERT INTO medications (id, record_id, name, dosage, frequency)
VALUES ('med0102-0102-0102-0102-010101010102', 'rec0102-0102-0102-0102-010101010102', 'Metformin', '500mg', 'Twice daily');

INSERT INTO medications (id, record_id, name, dosage, frequency)
VALUES ('med0104-0104-0104-0104-010101010104', 'rec0104-0104-0104-0104-010101010104', 'Prenatal Vitamins', '1 tablet', 'Once daily');

INSERT INTO medications (id, record_id, name, dosage, frequency)
VALUES ('med0105-0105-0105-0105-010101010105', 'rec0105-0105-0105-0105-010101010105', 'Paracetamol', '500mg', 'As needed');

INSERT INTO medications (id, record_id, name, dosage, frequency)
VALUES ('med0106-0106-0106-0106-010101010106', 'rec0106-0106-0106-0106-010101010106', 'Salbutamol', '100mcg', 'As needed');

INSERT INTO medications (id, record_id, name, dosage, frequency)
VALUES ('med0106-0106-0106-0106-010101010106b', 'rec0106-0106-0106-0106-010101010106', 'Prednisone', '20mg', 'Once daily');

INSERT INTO medications (id, record_id, name, dosage, frequency)
VALUES ('med0109-0109-0109-0109-010101010109', 'rec0109-0109-0109-0109-010101010109', 'Aspirin', '80mg', 'Once daily');

INSERT INTO medications (id, record_id, name, dosage, frequency)
VALUES ('med0109-0109-0109-0109-010101010109b', 'rec0109-0109-0109-0109-010101010109', 'Metoprolol', '25mg', 'Twice daily');

-- ============================================================
-- ALLERGIES (linked to records)
-- ============================================================

INSERT INTO allergies (id, record_id, allergen, severity)
VALUES ('alg0101-0101-0101-0101-010101010101', 'rec0101-0101-0101-0101-010101010101', 'Penicillin', 'moderate');

INSERT INTO allergies (id, record_id, allergen, severity)
VALUES ('alg0106-0106-0106-0106-010101010106', 'rec0106-0106-0106-0106-010101010106', 'Aspirin', 'mild');

-- ============================================================
-- ACCESS PERMISSIONS
-- ============================================================

-- Juan grants access to Dr. House
INSERT INTO access_permissions (id, patient_id, granted_to, permission_type, expires_at)
VALUES ('perm0101-0101-0101-0101-010101010101', 'aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'read', NOW() + INTERVAL '30 days');

-- Maria grants access to Dr. Shepherd
INSERT INTO access_permissions (id, patient_id, granted_to, permission_type, expires_at)
VALUES ('perm0102-0102-0102-0102-010101010102', 'bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'read', NOW() + INTERVAL '60 days');

-- Jose grants access to all doctors (for teaching purposes)
INSERT INTO access_permissions (id, patient_id, granted_to, permission_type, expires_at)
VALUES ('perm0103-0103-0103-0103-010101010103', 'ccccccc-cccc-cccc-cccc-cccccccccc', '22222222-2222-2222-2222-222222222222', 'read', NOW() + INTERVAL '90 days');

-- ============================================================
-- AUDIT LOGS (sample entries)
-- ============================================================

INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, access_reason, data_classification)
VALUES ('22222222-2222-2222-2222-222222222222', 'view', 'medical_record', 'rec0101-0101-0101-0101-010101010101', '192.168.1.100', 'treatment', 'diagnosis,treatment');

INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, access_reason, data_classification)
VALUES ('33333333-3333-3333-3333-333333333333', 'create', 'medical_record', 'rec0102-0102-0102-0102-010101010102', '192.168.1.101', 'treatment', 'diagnosis,treatment,notes');

INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, access_reason, data_classification)
VALUES ('66666666-6666-6666-6666-666666666666', 'view', 'medical_record', 'rec0108-0108-0108-0108-010101010108', '192.168.1.102', 'treatment', 'diagnosis,treatment');

INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, access_reason, data_classification)
VALUES ('88888888-8888-8888-8888-888888888888', 'view', 'medical_record', 'rec0101-0101-0101-0101-010101010101', '192.168.1.50', 'audit', 'diagnosis,treatment,notes');

-- ============================================================
-- CONFIRMATION
-- ============================================================

SELECT 'Dummy data loaded successfully!' AS status;

-- Show summary
SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role;