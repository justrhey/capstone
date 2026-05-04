//! Per-user Stellar keypair management.
//!
//! Each user has a deterministic-by-row Stellar Ed25519 keypair. The public key
//! ("G..." strkey) is stored plaintext in `users.stellar_pubkey`. The secret
//! ("S..." strkey) is encrypted with the same AES-256-GCM key used for SOAP
//! fields and stored in `users.stellar_secret_enc` with the `enc:v1:` prefix.
//!
//! The Keypair struct holds the raw secret bytes only for the duration of one
//! transaction-build; it is never logged or returned by an HTTP handler.

use crate::services::encryption::{decrypt_field, encrypt_field};
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand_core::OsRng;
use sqlx::PgPool;
use stellar_strkey::ed25519::{PrivateKey as StrkeyPriv, PublicKey as StrkeyPub};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum IdentityError {
    #[error("user not found: {0}")]
    UserNotFound(Uuid),
    #[error("user has no stellar identity (run backfill)")]
    NoIdentity,
    #[error("encryption error: {0}")]
    Encryption(String),
    #[error("strkey error: {0}")]
    Strkey(String),
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
}

/// Holds a freshly-decrypted secret. Drop it as soon as the tx is built.
pub struct PatientIdentity {
    pub pubkey_strkey: String,    // "G..."
    pub secret_strkey: String,    // "S..." — sensitive
}

/// Generate a new Ed25519 keypair encoded as Stellar strkeys.
pub fn generate_keypair() -> Result<PatientIdentity, IdentityError> {
    let signing = SigningKey::generate(&mut OsRng);
    let verifying: VerifyingKey = signing.verifying_key();

    let pub_strkey = StrkeyPub(verifying.to_bytes()).to_string();
    let priv_strkey = StrkeyPriv(signing.to_bytes()).to_string();
    Ok(PatientIdentity {
        pubkey_strkey: pub_strkey,
        secret_strkey: priv_strkey,
    })
}

/// Generate a keypair for `user_id` and persist it (pubkey plaintext, secret
/// encrypted with `key_hex`). No-op if the user already has a stellar_pubkey.
pub async fn ensure_for_user(
    pool: &PgPool,
    user_id: Uuid,
    key_hex: &str,
) -> Result<String, IdentityError> {
    if let Some(existing) = sqlx::query_scalar::<_, Option<String>>(
        "SELECT stellar_pubkey FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    {
        if let Some(pk) = existing {
            return Ok(pk);
        }
    } else {
        return Err(IdentityError::UserNotFound(user_id));
    }

    let id = generate_keypair()?;
    let enc = encrypt_field(&id.secret_strkey, key_hex)
        .map_err(IdentityError::Encryption)?;

    sqlx::query(
        "UPDATE users SET stellar_pubkey = $1, stellar_secret_enc = $2 WHERE id = $3",
    )
    .bind(&id.pubkey_strkey)
    .bind(&enc)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(id.pubkey_strkey)
}

/// Load and decrypt the user's keypair. Caller must drop the result promptly.
/// Reserved for future per-user signing of anchors (requires contract auth changes);
/// keep available so the backfilled secrets aren't write-only.
#[allow(dead_code)]
pub async fn load_for_user(
    pool: &PgPool,
    user_id: Uuid,
    key_hex: &str,
) -> Result<PatientIdentity, IdentityError> {
    let row: Option<(Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT stellar_pubkey, stellar_secret_enc FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let (pubkey, secret_enc) = row.ok_or(IdentityError::UserNotFound(user_id))?;
    let pubkey = pubkey.ok_or(IdentityError::NoIdentity)?;
    let secret_enc = secret_enc.ok_or(IdentityError::NoIdentity)?;
    let secret = decrypt_field(&secret_enc, key_hex);
    if secret == secret_enc {
        // decrypt_field returns the input unchanged on failure
        return Err(IdentityError::Encryption("decrypt returned ciphertext marker".into()));
    }

    Ok(PatientIdentity {
        pubkey_strkey: pubkey,
        secret_strkey: secret,
    })
}

/// One-shot: generate keypairs for every row in `users` lacking `stellar_pubkey`.
/// Returns the count of users updated.
pub async fn backfill_all_users(pool: &PgPool, key_hex: &str) -> Result<u64, IdentityError> {
    let ids: Vec<(Uuid,)> =
        sqlx::query_as("SELECT id FROM users WHERE stellar_pubkey IS NULL")
            .fetch_all(pool)
            .await?;

    let mut count = 0u64;
    for (id,) in ids {
        if ensure_for_user(pool, id, key_hex).await.is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_KEY: &str =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn generate_keypair_produces_valid_strkeys() {
        let id = generate_keypair().expect("generate");
        assert!(id.pubkey_strkey.starts_with('G'), "pubkey should be G..., got {}", id.pubkey_strkey);
        assert!(id.secret_strkey.starts_with('S'), "secret should be S..., got {}", id.secret_strkey);
        assert_eq!(id.pubkey_strkey.len(), 56, "Stellar G-strkey is 56 chars");
        assert_eq!(id.secret_strkey.len(), 56, "Stellar S-strkey is 56 chars");
    }

    #[test]
    fn keypairs_are_unique() {
        let a = generate_keypair().unwrap();
        let b = generate_keypair().unwrap();
        assert_ne!(a.pubkey_strkey, b.pubkey_strkey);
        assert_ne!(a.secret_strkey, b.secret_strkey);
    }

    #[test]
    fn encrypt_decrypt_secret_roundtrip() {
        let id = generate_keypair().unwrap();
        let enc = encrypt_field(&id.secret_strkey, TEST_KEY).expect("encrypt");
        assert!(enc.starts_with("enc:v1:"));
        let dec = decrypt_field(&enc, TEST_KEY);
        assert_eq!(dec, id.secret_strkey);
    }
}
