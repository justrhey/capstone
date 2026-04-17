//! TOTP (RFC 6238) helpers built on the `totp-rs` crate.
//!
//! Secrets live in `users.totp_secret` encrypted with AES-256-GCM via
//! [`crate::services::encryption`]. This module produces base32 payloads
//! and `otpauth://` URLs; it never persists anything itself.

use rand::RngCore;
use totp_rs::{Algorithm, TOTP};

const SECRET_LEN: usize = 20; // 160 bits, RFC 4226 minimum
const ISSUER: &str = "EHR Blockchain";

/// Generate a fresh random 20-byte secret.
pub fn generate_secret_bytes() -> Vec<u8> {
    let mut out = vec![0u8; SECRET_LEN];
    rand::rngs::OsRng.fill_bytes(&mut out);
    out
}

pub fn secret_to_base32(bytes: &[u8]) -> String {
    base32::encode(base32::Alphabet::Rfc4648 { padding: false }, bytes)
}

pub fn secret_from_base32(s: &str) -> Option<Vec<u8>> {
    base32::decode(base32::Alphabet::Rfc4648 { padding: false }, s)
}

/// Build an `otpauth://totp/...` URL that any Google Authenticator / Authy /
/// 1Password-compatible app can import via QR code or manual entry.
pub fn build_otpauth_url(secret_base32: &str, account_label: &str) -> String {
    format!(
        "otpauth://totp/{issuer}:{label}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30",
        issuer = pct(ISSUER),
        label = pct(account_label),
        secret = secret_base32,
    )
}

/// Verify a user-supplied 6-digit code with ±1 window (30s) drift tolerance.
pub fn verify_code(secret_bytes: &[u8], code: &str) -> bool {
    let totp = match TOTP::new(Algorithm::SHA1, 6, 1, 30, secret_bytes.to_vec()) {
        Ok(t) => t,
        Err(_) => return false,
    };
    let trimmed = code.trim();
    totp.check_current(trimmed).unwrap_or(false)
}

/// Minimal URL-percent-encoder for the subset of chars that appear in issuer/label.
fn pct(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '.' | '_' | '~' => c.to_string(),
            _ => {
                let mut buf = [0u8; 4];
                let encoded = c.encode_utf8(&mut buf);
                encoded
                    .bytes()
                    .map(|b| format!("%{:02X}", b))
                    .collect::<String>()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }

    fn code_for(secret: &[u8], ts: u64) -> String {
        let totp = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret.to_vec()).unwrap();
        totp.generate(ts)
    }

    #[test]
    fn secret_is_20_bytes() {
        let s = generate_secret_bytes();
        assert_eq!(s.len(), 20);
    }

    #[test]
    fn base32_roundtrip() {
        let s = generate_secret_bytes();
        let b = secret_to_base32(&s);
        let back = secret_from_base32(&b).expect("decode");
        assert_eq!(back, s);
    }

    #[test]
    fn verify_accepts_current_window() {
        let s = generate_secret_bytes();
        let code = code_for(&s, now());
        assert!(verify_code(&s, &code));
    }

    #[test]
    fn verify_accepts_plus_one_window() {
        let s = generate_secret_bytes();
        // Generate code for the upcoming window — client clock slightly ahead.
        let code = code_for(&s, now() + 30);
        assert!(verify_code(&s, &code), "±1 drift must be tolerated");
    }

    #[test]
    fn verify_accepts_minus_one_window() {
        let s = generate_secret_bytes();
        let code = code_for(&s, now().saturating_sub(30));
        assert!(verify_code(&s, &code), "−1 drift must be tolerated");
    }

    #[test]
    fn verify_rejects_wrong_secret() {
        let s1 = generate_secret_bytes();
        let s2 = generate_secret_bytes();
        let code = code_for(&s1, now());
        assert!(!verify_code(&s2, &code));
    }

    #[test]
    fn verify_rejects_garbage_code() {
        let s = generate_secret_bytes();
        assert!(!verify_code(&s, "000000"));
        assert!(!verify_code(&s, "not a code"));
    }

    #[test]
    fn otpauth_url_structure() {
        let url = build_otpauth_url("JBSWY3DPEHPK3PXP", "user@example.com");
        assert!(url.starts_with("otpauth://totp/"));
        assert!(url.contains("secret=JBSWY3DPEHPK3PXP"));
        assert!(url.contains("issuer=EHR%20Blockchain"));
        assert!(url.contains("user%40example.com"));
    }
}
