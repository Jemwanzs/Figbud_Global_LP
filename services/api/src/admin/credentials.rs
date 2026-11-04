//! Credential primitives: password hashing (Argon2id), TOTP (RFC 6238),
//! encryption of TOTP secrets at rest and recovery codes. No I/O.

use std::sync::OnceLock;

use argon2::{
    Algorithm, Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version,
    password_hash::SaltString,
};
use chacha20poly1305::{ChaCha20Poly1305, KeyInit, aead::Aead};
use hmac::{Hmac, Mac};
use rand::{Rng, RngCore};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use uuid::Uuid;

pub const MIN_PASSWORD: usize = 12;
/// Long enough for any passphrase, short enough that hashing can't be abused.
pub const MAX_PASSWORD: usize = 128;
const TOTP_PERIOD: u64 = 30;
const TOTP_DIGITS: u32 = 6;
pub const RECOVERY_CODES: usize = 10;
/// No look-alike characters (0/O, 1/I/L), so codes can be read off paper.
const RECOVERY_ALPHABET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/// The worst passwords that still meet the length rule.
const COMMON: &[&str] = &[
    "password1234",
    "password12345",
    "password123456",
    "passwordpassword",
    "123456789012",
    "1234567890123",
    "12345678901234",
    "qwertyuiop12",
    "qwertyuiop123",
    "qwerty123456",
    "administrator",
    "adminadminadmin",
    "letmeinletmein",
    "welcome12345",
    "welcome123456",
    "figbudglobal",
    "figbudglobal1",
    "figbudglobal123",
];

/// OWASP's recommended Argon2id parameters (19 MiB, two passes).
fn argon2() -> Argon2<'static> {
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(19_456, 2, 1, None).expect("valid Argon2 parameters"),
    )
}

pub fn hash_password(password: &str) -> Result<String, String> {
    let mut salt = [0u8; 16];
    rand::rng().fill_bytes(&mut salt);
    let salt = SaltString::encode_b64(&salt).map_err(|e| e.to_string())?;
    argon2()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

/// Compares against a stored hash. Pass `None` for an unknown account: the
/// same work is done against a throwaway hash, so timing doesn't reveal it.
pub fn verify_password(stored: Option<&str>, password: &str) -> bool {
    static DUMMY: OnceLock<String> = OnceLock::new();
    let dummy = DUMMY.get_or_init(|| hash_password("no account has this password").unwrap_or_default());
    let known = stored.is_some();
    let Ok(parsed) = PasswordHash::new(stored.unwrap_or(dummy)) else {
        return false;
    };
    argon2().verify_password(password.as_bytes(), &parsed).is_ok() && known
}

/// Why a new password is refused, in words a person can act on.
pub fn password_problem(password: &str, email: &str, name: &str) -> Option<&'static str> {
    let length = password.chars().count();
    if length < MIN_PASSWORD {
        return Some("Use at least 12 characters. A short phrase is easiest to remember.");
    }
    if length > MAX_PASSWORD {
        return Some("Use up to 128 characters.");
    }
    let lower = password.to_lowercase();
    if COMMON.contains(&lower.as_str()) || lower.chars().all(|c| lower.starts_with(c)) {
        return Some("That password is too easy to guess. Try a longer phrase.");
    }
    let local = email.split('@').next().unwrap_or_default().to_lowercase();
    if lower == email.to_lowercase() || (local.len() >= 4 && lower.contains(&local)) {
        return Some("Don't use your email address in your password.");
    }
    if lower == name.trim().to_lowercase() {
        return Some("Don't use your name as your password.");
    }
    None
}

pub fn new_totp_secret() -> Vec<u8> {
    let mut secret = [0u8; 20];
    rand::rng().fill_bytes(&mut secret);
    secret.to_vec()
}

/// RFC 6238 with SHA-1, 30 seconds and six digits: what authenticator apps use.
pub fn totp_code(secret: &[u8], step: u64) -> String {
    let mut mac = <Hmac<Sha1> as Mac>::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(&step.to_be_bytes());
    let digest = mac.finalize().into_bytes();
    let offset = (digest[19] & 0x0f) as usize;
    let word = u32::from_be_bytes([
        digest[offset] & 0x7f,
        digest[offset + 1],
        digest[offset + 2],
        digest[offset + 3],
    ]);
    format!(
        "{:0width$}",
        word % 10u32.pow(TOTP_DIGITS),
        width = TOTP_DIGITS as usize
    )
}

/// The time step a code is valid for: the current one or one either side
/// (clock drift), never one at or before `last_step` (replay).
pub fn verify_totp(secret: &[u8], code: &str, unix_time: u64, last_step: Option<i64>) -> Option<i64> {
    let code: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    if code.len() != TOTP_DIGITS as usize || !code.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let now = unix_time / TOTP_PERIOD;
    let mut matched = None;
    // Every candidate is checked, so timing doesn't reveal which one matched.
    for step in now.saturating_sub(1)..=now + 1 {
        if bool::from(totp_code(secret, step).as_bytes().ct_eq(code.as_bytes())) {
            matched = Some(step as i64);
        }
    }
    matched.filter(|step| last_step.is_none_or(|last| *step > last))
}

pub fn base32(secret: &[u8]) -> String {
    data_encoding::BASE32_NOPAD.encode(secret)
}

/// The address authenticator apps read from the QR code.
pub fn otpauth_url(issuer: &str, email: &str, secret: &[u8]) -> String {
    // Spaces as %20: some authenticator apps show a form-encoded "+" literally.
    let encode = |value: &str| {
        url::form_urlencoded::byte_serialize(value.as_bytes())
            .collect::<String>()
            .replace('+', "%20")
    };
    let issuer = encode(issuer);
    format!(
        "otpauth://totp/{issuer}:{email}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30",
        email = encode(email),
        secret = base32(secret),
    )
}

/// QR modules, row by row ("1" dark, "0" light), drawn by the Studio as plain shapes.
pub fn qr_modules(data: &str) -> Result<(usize, String), String> {
    let code = qrcode::QrCode::new(data.as_bytes()).map_err(|e| e.to_string())?;
    let modules = code
        .to_colors()
        .iter()
        .map(|c| if *c == qrcode::Color::Dark { '1' } else { '0' })
        .collect();
    Ok((code.width(), modules))
}

/// Encrypts a TOTP secret: a random nonce followed by the sealed bytes.
pub fn seal(key: &[u8; 32], plain: &[u8]) -> Result<Vec<u8>, String> {
    let mut nonce = [0u8; 12];
    rand::rng().fill_bytes(&mut nonce);
    let sealed = ChaCha20Poly1305::new(key.into())
        .encrypt((&nonce).into(), plain)
        .map_err(|e| e.to_string())?;
    Ok([nonce.as_slice(), &sealed].concat())
}

pub fn open(key: &[u8; 32], sealed: &[u8]) -> Option<Vec<u8>> {
    if sealed.len() < 12 {
        return None;
    }
    let (nonce, body) = sealed.split_at(12);
    let nonce: [u8; 12] = nonce.try_into().ok()?;
    ChaCha20Poly1305::new(key.into())
        .decrypt((&nonce).into(), body)
        .ok()
}

/// A set of single-use recovery codes, shown once: `ABCDE-FGHJK`.
pub fn new_recovery_codes() -> Vec<String> {
    let mut rng = rand::rng();
    (0..RECOVERY_CODES)
        .map(|_| {
            let chars: Vec<char> = (0..10)
                .map(|_| RECOVERY_ALPHABET[rng.random_range(0..RECOVERY_ALPHABET.len())] as char)
                .collect();
            format!(
                "{}-{}",
                chars[..5].iter().collect::<String>(),
                chars[5..].iter().collect::<String>()
            )
        })
        .collect()
}

/// Stored form of a recovery code, tied to its owner. Spaces, dashes and case don't matter.
pub fn recovery_hash(user_id: Uuid, code: &str) -> Vec<u8> {
    let normal: String = code
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.to_ascii_uppercase())
        .collect();
    let mut hash = Sha256::new();
    hash.update(user_id.as_bytes());
    hash.update(normal.as_bytes());
    hash.finalize().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passwords_hash_with_argon2id_and_verify() {
        let hash = hash_password("correct horse battery").unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(!hash.contains("correct"));
        assert_ne!(hash, hash_password("correct horse battery").unwrap(), "salted");
        assert!(verify_password(Some(&hash), "correct horse battery"));
        assert!(!verify_password(Some(&hash), "wrong horse battery"));
        assert!(!verify_password(None, "no account has this password"));
    }

    #[test]
    fn weak_passwords_are_refused_with_a_reason() {
        let check = |p: &str| password_problem(p, "amina.w@figbud.test", "Amina Wanjiru");
        assert!(check("short").is_some());
        assert!(check("password1234").is_some());
        assert!(check("PassWord1234").is_some(), "case doesn't matter");
        assert!(check("aaaaaaaaaaaaaa").is_some());
        assert!(check("amina.w@figbud.test").is_some());
        assert!(check("my-amina.w-password").is_some());
        assert!(check("Amina Wanjiru").is_some());
        assert!(check(&"x1".repeat(100)).is_some());
        assert_eq!(check("granite river lantern"), None);
    }

    #[test]
    fn totp_matches_the_rfc_6238_vectors() {
        // RFC 6238 appendix B, SHA-1, reduced to six digits.
        let secret = b"12345678901234567890";
        for (time, code) in [
            (59u64, "287082"),
            (1_111_111_109, "081804"),
            (1_111_111_111, "050471"),
            (1_234_567_890, "005924"),
            (2_000_000_000, "279037"),
        ] {
            assert_eq!(totp_code(secret, time / 30), code);
        }
    }

    #[test]
    fn totp_allows_slight_drift_but_never_a_replay() {
        let secret = new_totp_secret();
        let now = 1_800_000_000u64;
        let step = (now / 30) as i64;
        let code = totp_code(&secret, step as u64);
        assert_eq!(verify_totp(&secret, &code, now, None), Some(step));
        assert_eq!(verify_totp(&secret, &code, now + 30, None), Some(step));
        assert_eq!(verify_totp(&secret, &code, now + 90, None), None, "too old");
        assert_eq!(verify_totp(&secret, &code, now, Some(step)), None, "replay");
        assert_eq!(
            verify_totp(&secret, &format!(" {} ", code), now, None),
            Some(step)
        );
        assert_eq!(verify_totp(&secret, "12345", now, None), None);
        assert_eq!(verify_totp(&secret, "abcdef", now, None), None);
    }

    #[test]
    fn secrets_are_encrypted_and_tampering_is_detected() {
        let key = [7u8; 32];
        let secret = new_totp_secret();
        let sealed = seal(&key, &secret).unwrap();
        assert!(!sealed.windows(secret.len()).any(|w| w == secret));
        assert_ne!(sealed, seal(&key, &secret).unwrap(), "fresh nonce");
        assert_eq!(open(&key, &sealed).unwrap(), secret);
        assert_eq!(open(&[8u8; 32], &sealed), None, "wrong key");
        let mut tampered = sealed;
        *tampered.last_mut().unwrap() ^= 1;
        assert_eq!(open(&key, &tampered), None);
        assert_eq!(open(&key, b"short"), None);
    }

    #[test]
    fn recovery_codes_are_unique_readable_and_forgiving_to_type() {
        let codes = new_recovery_codes();
        assert_eq!(codes.len(), RECOVERY_CODES);
        let unique: std::collections::HashSet<_> = codes.iter().collect();
        assert_eq!(unique.len(), RECOVERY_CODES);
        assert!(
            codes
                .iter()
                .all(|c| c.len() == 11 && !c.contains(['0', 'O', '1', 'I', 'L']))
        );
        let user = Uuid::now_v7();
        assert_eq!(
            recovery_hash(user, "abcde fghjk"),
            recovery_hash(user, "ABCDE-FGHJK")
        );
        assert_ne!(
            recovery_hash(user, "ABCDE-FGHJK"),
            recovery_hash(Uuid::now_v7(), "ABCDE-FGHJK")
        );
    }

    #[test]
    fn the_authenticator_address_and_qr_code_carry_the_secret() {
        let secret = b"12345678901234567890";
        assert_eq!(base32(secret), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
        let url = otpauth_url("FigBud Studio", "amina@figbud.test", secret);
        assert!(url.starts_with("otpauth://totp/FigBud%20Studio:amina%40figbud.test?secret=GEZDGNBV"));
        assert!(url.contains("issuer=FigBud%20Studio") && url.contains("period=30"));
        let (size, modules) = qr_modules(&url).unwrap();
        assert_eq!(modules.len(), size * size);
    }
}
