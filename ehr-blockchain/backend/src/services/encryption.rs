use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use hex;

pub fn encrypt_data(plaintext: &[u8], key_hex: &str) -> Result<Vec<u8>, String> {
    let key = hex::decode(key_hex).map_err(|e| format!("Invalid hex key: {}", e))?;
    let key = key.as_slice().try_into()
        .map_err(|_| "Key must be 32 bytes".to_string())?;
    let cipher = Aes256Gcm::new(&key);

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut result = nonce.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

pub fn decrypt_data(encrypted: &[u8], key_hex: &str) -> Result<Vec<u8>, String> {
    let key = hex::decode(key_hex).map_err(|e| format!("Invalid hex key: {}", e))?;
    let key = key.as_slice().try_into()
        .map_err(|_| "Key must be 32 bytes".to_string())?;
    let cipher = Aes256Gcm::new(&key);

    if encrypted.len() < 12 {
        return Err("Encrypted data too short".into());
    }

    let (nonce, ciphertext) = encrypted.split_at(12);
    let nonce = Nonce::from_slice(nonce);

    cipher.decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))
}