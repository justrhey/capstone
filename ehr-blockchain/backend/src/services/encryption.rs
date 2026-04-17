use aes_gcm::aead::consts::U12;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm,
};
use generic_array::GenericArray;
use hex;
use rand::rngs::OsRng;
use rand::RngCore;

type Nonce = GenericArray<u8, U12>;

pub fn encrypt_data(plaintext: &[u8], key_hex: &str) -> Result<Vec<u8>, String> {
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid hex key: {}", e))?;
    if key_bytes.len() != 32 {
        return Err("Key must be 32 bytes".into());
    }

    let key = GenericArray::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Versioned marker prefix for encrypted values stored in TEXT columns.
/// `enc:v1:` = AES-256-GCM with a 12-byte random nonce, hex-encoded.
/// Legacy `enc:` (no version) is accepted on read for backward compatibility.
/// Future key rotation can introduce `enc:v2:` with a new scheme; `decrypt_field`
/// can then dispatch on the version tag.
const ENC_PREFIX_V1: &str = "enc:v1:";
const ENC_PREFIX_LEGACY: &str = "enc:";

pub fn encrypt_field(plaintext: &str, key_hex: &str) -> Result<String, String> {
    let ciphertext = encrypt_data(plaintext.as_bytes(), key_hex)?;
    Ok(format!("{}{}", ENC_PREFIX_V1, hex::encode(ciphertext)))
}

/// Best-effort decrypt. Dispatches on the version prefix; falls back to the
/// unversioned legacy prefix; returns the value unchanged for plaintext rows.
pub fn decrypt_field(value: &str, key_hex: &str) -> String {
    let hex_payload = if let Some(rest) = value.strip_prefix(ENC_PREFIX_V1) {
        rest
    } else if let Some(rest) = value.strip_prefix(ENC_PREFIX_LEGACY) {
        rest
    } else {
        return value.to_string();
    };

    match hex::decode(hex_payload) {
        Ok(bytes) => match decrypt_data(&bytes, key_hex) {
            Ok(plain) => String::from_utf8(plain).unwrap_or_else(|_| value.to_string()),
            Err(e) => {
                eprintln!("[encryption] decrypt failed, returning ciphertext marker: {}", e);
                value.to_string()
            }
        },
        Err(e) => {
            eprintln!("[encryption] hex decode failed: {}", e);
            value.to_string()
        }
    }
}

pub fn encrypt_field_opt(value: &Option<String>, key_hex: &str) -> Result<Option<String>, String> {
    match value {
        Some(v) if !v.is_empty() => encrypt_field(v, key_hex).map(Some),
        _ => Ok(None),
    }
}

pub fn decrypt_field_opt(value: &Option<String>, key_hex: &str) -> Option<String> {
    value.as_ref().map(|v| decrypt_field(v, key_hex))
}

pub fn is_encrypted_marker(value: &str) -> bool {
    value.starts_with(ENC_PREFIX_V1) || value.starts_with(ENC_PREFIX_LEGACY)
}

/// One-shot startup backfill: re-write any plaintext columns in medical_records and
/// patients (first_name/last_name) as encrypted. Idempotent — rows already marked with
/// `enc:` are skipped.
pub async fn backfill_encrypt_on_startup(pool: &sqlx::PgPool, key_hex: &str) {
    let mut encrypted_rows = 0u64;

    // medical_records — SOAP fields
    let records = sqlx::query_as::<_, (
        sqlx::types::Uuid,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )>(
        "SELECT id, subjective, objective, assessment, \"plan\" FROM medical_records",
    )
    .fetch_all(pool)
    .await;
    let records = match records {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[backfill] could not scan medical_records: {}", e);
            return;
        }
    };

    for (id, subj, obj, assess, plan) in records {
        let needs = [&subj, &obj, &assess, &plan]
            .iter()
            .any(|v| v.as_ref().map(|s| !is_encrypted_marker(s)).unwrap_or(false));
        if !needs {
            continue;
        }
        let encrypt_opt = |v: &Option<String>| -> Option<String> {
            match v {
                Some(s) if !s.is_empty() && !is_encrypted_marker(s) => {
                    encrypt_field(s, key_hex).ok()
                }
                _ => v.clone(),
            }
        };
        let s_ = encrypt_opt(&subj);
        let o_ = encrypt_opt(&obj);
        let a_ = encrypt_opt(&assess);
        let p_ = encrypt_opt(&plan);
        let res = sqlx::query(
            "UPDATE medical_records SET subjective = $1, objective = $2, assessment = $3, \"plan\" = $4 WHERE id = $5",
        )
        .bind(&s_)
        .bind(&o_)
        .bind(&a_)
        .bind(&p_)
        .bind(id)
        .execute(pool)
        .await;
        match res {
            Ok(_) => encrypted_rows += 1,
            Err(e) => eprintln!("[backfill] failed to encrypt record {}: {}", id, e),
        }
    }

    // patients (first_name / last_name)
    let patients = sqlx::query_as::<_, (sqlx::types::Uuid, Option<String>, Option<String>)>(
        "SELECT id, first_name, last_name FROM patients",
    )
    .fetch_all(pool)
    .await;
    let patients = match patients {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[backfill] could not scan patients: {}", e);
            return;
        }
    };

    for (id, first_name, last_name) in patients {
        let needs = [&first_name, &last_name]
            .iter()
            .any(|v| v.as_ref().map(|s| !is_encrypted_marker(s)).unwrap_or(false));
        if !needs {
            continue;
        }
        let encrypt_opt = |v: &Option<String>| -> Option<String> {
            match v {
                Some(s) if !s.is_empty() && !is_encrypted_marker(s) => {
                    encrypt_field(s, key_hex).ok()
                }
                _ => v.clone(),
            }
        };
        let f = encrypt_opt(&first_name);
        let l = encrypt_opt(&last_name);
        let res = sqlx::query(
            "UPDATE patients SET first_name = $1, last_name = $2 WHERE id = $3",
        )
        .bind(&f)
        .bind(&l)
        .bind(id)
        .execute(pool)
        .await;
        match res {
            Ok(_) => encrypted_rows += 1,
            Err(e) => eprintln!("[backfill] failed to encrypt patient {}: {}", id, e),
        }
    }

    if encrypted_rows > 0 {
        println!("[backfill] encrypted {} rows at startup", encrypted_rows);
    }
}

pub fn decrypt_data(encrypted: &[u8], key_hex: &str) -> Result<Vec<u8>, String> {
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid hex key: {}", e))?;
    if key_bytes.len() != 32 {
        return Err("Key must be 32 bytes".into());
    }

    let key = GenericArray::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    if encrypted.len() < 12 {
        return Err("Encrypted data too short".into());
    }

    let (nonce_bytes, ciphertext) = encrypted.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let plaintext = "Hypertension; treat with lisinopril 10mg daily";
        let enc = encrypt_field(plaintext, KEY).expect("encrypt");
        assert!(enc.starts_with("enc:v1:"), "expected v1 prefix, got {}", enc);
        let dec = decrypt_field(&enc, KEY);
        assert_eq!(dec, plaintext);
    }

    #[test]
    fn decrypt_legacy_unversioned_prefix_still_works() {
        // Simulate a row written by an older encryptor (raw `enc:` prefix).
        let plaintext = "legacy row";
        let bytes = encrypt_data(plaintext.as_bytes(), KEY).unwrap();
        let legacy = format!("enc:{}", hex::encode(bytes));
        let dec = decrypt_field(&legacy, KEY);
        assert_eq!(dec, plaintext);
    }

    #[test]
    fn plaintext_returned_unchanged() {
        assert_eq!(decrypt_field("not encrypted", KEY), "not encrypted");
        assert_eq!(decrypt_field("", KEY), "");
    }

    #[test]
    fn malformed_hex_returns_original() {
        // We intentionally do not panic on bad ciphertext.
        let bad = "enc:v1:not-hex-!!";
        assert_eq!(decrypt_field(bad, KEY), bad);
    }

    #[test]
    fn is_encrypted_marker_accepts_both_prefixes() {
        assert!(is_encrypted_marker("enc:v1:abc"));
        assert!(is_encrypted_marker("enc:abc"));
        assert!(!is_encrypted_marker("plain text"));
    }

    #[test]
    fn field_opt_helpers_handle_none_and_empty() {
        assert!(encrypt_field_opt(&None, KEY).unwrap().is_none());
        assert!(encrypt_field_opt(&Some(String::new()), KEY).unwrap().is_none());
        let enc = encrypt_field_opt(&Some("hello".into()), KEY).unwrap().unwrap();
        assert_eq!(decrypt_field_opt(&Some(enc), KEY).unwrap(), "hello");
    }
}
