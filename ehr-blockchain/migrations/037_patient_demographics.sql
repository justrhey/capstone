-- Add patient demographics to the dummy data
-- Run this after 036_dummy_data.sql

-- Update patients with additional info

-- Juan dela Cruz
UPDATE patients SET 
    blood_type = 'O+',
    contact_number = '+63 912 345 6789',
    address = '123 Mabini Street, Manila, Philippines'
WHERE id = 'aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Maria Garcia
UPDATE patients SET 
    blood_type = 'A+',
    contact_number = '+63 918 234 5678',
    address = '45 Taft Avenue, Quezon City, Philippines'
WHERE id = 'bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Jose Rizal
UPDATE patients SET 
    blood_type = 'B+',
    contact_number = '+63 929 876 5432',
    address = '78 Bonifacio Highway, Makati, Philippines'
WHERE id = 'ccccccc-cccc-cccc-cccc-cccccccccc';

-- Andi Diaz
UPDATE patients SET 
    blood_type = 'O-',
    contact_number = '+63 956 123 4567',
    address = '32 EDSA, Caloocan, Philippines'
WHERE id = 'ddddddd-dddd-dddd-dddd-dddddddddd';

-- Miguel Reyes
UPDATE patients SET 
    blood_type = 'AB+',
    contact_number = '+63 917 345 6789',
    address = '67 Roxas Boulevard, Pasay, Philippines'
WHERE id = 'eeeeeee-eeee-eeee-eeee-eeeeeeeeee';

-- Fatima Cortez
UPDATE patients SET 
    blood_type = 'A-',
    contact_number = '+63 928 456 7890',
    address = '89 Aurora Boulevard, Cubao, Philippines'
WHERE id = 'fffffff-ffff-ffff-ffff-ffffffff';

-- Pedro Penduko
UPDATE patients SET 
    blood_type = 'O+',
    contact_number = '+63 935 567 8901',
    address = '101 Gilmore Highway, Quezon City, Philippines'
WHERE id = 'ggggggg-gggg-gggg-gggg-ggggggggggg';

-- Rosa Luz
UPDATE patients SET 
    blood_type = 'B-',
    contact_number = '+63 926 678 9012',
    address = '54 España Boulevard, Manila, Philippines'
WHERE id = 'hhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh';

-- Fernando Amorsolo
UPDATE patients SET 
    blood_type = 'A+',
    contact_number = '+63 937 789 0123',
    address = '21 Visayas Avenue, Paranaque, Philippines'
WHERE id = 'iiiiiii-iiii-iiii-iiii-iiiiiiiiii';

-- Lucy Mercado
UPDATE patients SET 
    blood_type = 'O+',
    contact_number = '+63 938 890 1234',
    address = '88 Luzon Avenue, Manila, Philippines'
WHERE id = 'jjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj';

SELECT 'Patient demographics updated!' AS status;