//! Unit Tests for EHR Backend Services

#[cfg(test)]
mod encryption_tests {
    use crate::services::encryption::{decrypt_field_opt, encrypt_field_opt};

    const TEST_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let plaintext = "Sensitive medical data";
        let encrypted = encrypt_field_opt(&Some(plaintext.to_string()), TEST_KEY).unwrap();
        assert!(encrypted.is_some());
        
        let decrypted = decrypt_field_opt(&encrypted, TEST_KEY).unwrap();
        assert_eq!(decrypted, Some(plaintext.to_string()));
    }

    #[test]
    fn test_encrypt_none_returns_none() {
        let result = encrypt_field_opt(&None, TEST_KEY);
        assert_eq!(result, None);
    }

    #[test]
    fn test_decrypt_none_returns_none() {
        let result = decrypt_field_opt(&None, TEST_KEY);
        assert_eq!(result, None);
    }

    #[test]
    fn test_encryption_produces_different_ciphertext() {
        let plaintext = "Same text";
        let encrypted1 = encrypt_field_opt(&Some(plaintext.to_string()), TEST_KEY).unwrap();
        let encrypted2 = encrypt_field_opt(&Some(plaintext.to_string()), TEST_KEY).unwrap();
        
        // With different IVs, ciphertexts should differ
        assert_ne!(encrypted1, encrypted2);
    }
}

#[cfg(test)]
mod auth_service_tests {
    use crate::services::auth_service::{hash_password, verify_password};

    #[test]
    fn test_password_hashing() {
        let password = "SecurePass123!";
        let hash = hash_password(password).unwrap();
        
        assert!(!hash.is_empty());
        assert!(verify_password(password, &hash).unwrap());
    }

    #[test]
    fn test_wrong_password_fails() {
        let password = "SecurePass123!";
        let hash = hash_password(password).unwrap();
        
        assert!(!verify_password("WrongPassword", &hash).unwrap());
    }

    #[test]
    fn test_bcrypt_cost_factor() {
        // Verify bcrypt is using cost factor 10 (or higher)
        let password = "test";
        let hash = hash_password(password).unwrap();
        
        // Bcrypt hashes start with $2b$10$ or $2b$11$
        assert!(hash.starts_with("$2b$10$") || hash.starts_with("$2b$11$"));
    }
}

#[cfg(test)]
mod hash_service_tests {
    use crate::services::hash_service::{hash_record_content, verify_record_integrity};

    #[test]
    fn test_record_hashing() {
        let subjective = "Patient reports chest pain";
        let objective = "BP 140/90, HR 88";
        let assessment = "Possible angina";
        let plan = "ECG and stress test";
        
        let hash = hash_record_content(subjective, objective, assessment, plan);
        
        assert!(!hash.is_empty());
        assert_eq!(hash.len(), 64); // SHA-256 produces 64 hex characters
    }

    #[test]
    fn test_hash_deterministic() {
        let content = "test|content|hash|test";
        
        let hash1 = hash_record_content("test", "content", "hash", "test");
        let hash2 = hash_record_content("test", "content", "hash", "test");
        
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_changes_with_content() {
        let content1 = "test|content|hash|test";
        let content2 = "test|content|hash|different";
        
        let hash1 = hash_record_content("test", "content", "hash", "test");
        let hash2 = hash_record_content("test", "content", "hash", "different");
        
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_verify_integrity_success() {
        let subjective = "Test subjective";
        let objective = "Test objective";
        let assessment = "Test assessment";
        let plan = "Test plan";
        
        let hash = hash_record_content(subjective, objective, assessment, plan);
        
        assert!(verify_record_integrity(
            &subjective,
            &objective,
            &assessment,
            &plan,
            &hash
        ));
    }

    #[test]
    fn test_verify_integrity_failure() {
        let subjective = "Original subjective";
        let objective = "Original objective";
        let assessment = "Original assessment";
        let plan = "Original plan";
        
        let original_hash = hash_record_content(subjective, objective, assessment, plan);
        
        // Tamper with content
        assert!(!verify_record_integrity(
            &"Tampered subjective".to_string(),
            &objective,
            &assessment,
            &plan,
            &original_hash
        ));
    }
}

#[cfg(test)]
mod jwt_service_tests {
    use crate::services::jwt::{create_token, decode_token};
    use crate::models::user::User;
    use std::collections::HashMap;

    #[test]
    fn test_jwt_create_and_decode() {
        let user = User {
            id: uuid::Uuid::new_v4(),
            email: "test@example.com".to_string(),
            role: "doctor".to_string(),
            ..Default::default()
        };
        
        let secret = "test_secret_key_long_enough_forHS256";
        let expiration = 15;
        
        let token = create_token(&user, secret, expiration).unwrap();
        
        let claims = decode_token(&token, secret).unwrap();
        
        assert_eq!(claims.get("sub"), Some(&"test@example.com".to_string()));
        assert_eq!(claims.get("role"), Some(&"doctor".to_string()));
    }

    #[test]
    fn test_invalid_token_fails() {
        let secret = "test_secret_key_long_enough_forHS256";
        
        let result = decode_token("invalid.token.here", secret);
        
        assert!(result.is_err());
    }

    #[test]
    fn test_expired_token() {
        let user = User {
            id: uuid::Uuid::new_v4(),
            email: "test@example.com".to_string(),
            role: "doctor".to_string(),
            ..Default::default()
        };
        
        let secret = "test_secret_key_long_enough_forHS256";
        
        // Create token with 0 second expiration (already expired)
        let token = create_token(&user, secret, 0).unwrap();
        
        // Wait a moment
        std::thread::sleep(std::time::Duration::from_millis(100));
        
        let result = decode_token(&token, secret);
        
        assert!(result.is_err());
    }
}