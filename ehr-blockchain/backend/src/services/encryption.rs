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
