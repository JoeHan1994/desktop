//! AES-256-GCM authenticated encryption.
//!
//! Provides a single `AesGcmCipher` wrapper that encapsulates key management
//! and per-secret encrypt/decrypt operations. All secrets are stored as
//! Base64-encoded `(ciphertext, nonce)` pairs.
//!
//! # Security
//! - A fresh 96-bit random nonce is generated per encryption call via `OsRng`.
//! - AES-256-GCM provides both confidentiality and integrity (auth tag).
//! - Empty plaintext is treated as "no value" and returns `("", "")` to avoid
//!   storing dummy ciphertexts.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::rngs::OsRng;
use rand::RngCore;

use crate::error::{AppError, Result};

// ── AesGcmCipher ─────────────────────────────────────────────────────────

/// AES-256-GCM cipher backed by a 32-byte key.
///
/// Construct once from a stored key and reuse for multiple encrypt/decrypt calls.
pub struct AesGcmCipher {
    inner: Aes256Gcm,
}

impl AesGcmCipher {
    /// Construct from a raw 32-byte key slice.
    pub fn from_key(key: [u8; 32]) -> Self {
        // 32-byte key length is guaranteed by the type, so this never fails.
        Self {
            inner: Aes256Gcm::new_from_slice(&key).expect("32-byte key is always valid"),
        }
    }

    /// Construct from a Base64-encoded 32-byte key string (read from config file).
    pub fn from_base64(b64: &str) -> Result<Self> {
        let bytes = BASE64
            .decode(b64.trim())
            .map_err(|_| AppError::Config("encryption_key_base64 不是有效 Base64".to_string()))?;
        let key: [u8; 32] = bytes.try_into().map_err(|_| {
            AppError::Config("encryption_key_base64 解码后必须是 32 字节".to_string())
        })?;
        Ok(Self::from_key(key))
    }

    /// Encrypt `plaintext` → `(ciphertext_b64, nonce_b64)`.
    ///
    /// Returns `("", "")` for empty input so callers can store `NULL` in the DB.
    pub fn encrypt(&self, plaintext: &str) -> Result<(String, String)> {
        if plaintext.is_empty() {
            return Ok((String::new(), String::new()));
        }
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = self
            .inner
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|_| AppError::Crypto("AES-GCM 加密失败".to_string()))?;
        Ok((BASE64.encode(&ciphertext), BASE64.encode(nonce_bytes)))
    }

    /// Decrypt `(ciphertext_b64, nonce_b64)` → plaintext.
    ///
    /// Returns `""` when both inputs are empty (stored `NULL` columns).
    pub fn decrypt(&self, ciphertext_b64: &str, nonce_b64: &str) -> Result<String> {
        if ciphertext_b64.is_empty() || nonce_b64.is_empty() {
            return Ok(String::new());
        }
        let cipher_bytes = BASE64
            .decode(ciphertext_b64)
            .map_err(|_| AppError::Crypto("密文不是有效 Base64".to_string()))?;
        let nonce_bytes = BASE64
            .decode(nonce_b64)
            .map_err(|_| AppError::Crypto("nonce 不是有效 Base64".to_string()))?;
        let nonce: [u8; 12] = nonce_bytes.try_into().map_err(|_| {
            AppError::Crypto("nonce 长度无效，应为 12 字节".to_string())
        })?;
        let plaintext = self
            .inner
            .decrypt(Nonce::from_slice(&nonce), cipher_bytes.as_ref())
            .map_err(|_| {
                AppError::Crypto(
                    "解密失败，请确认本机 encryption_key_base64 与写入时一致".to_string(),
                )
            })?;
        String::from_utf8(plaintext)
            .map_err(|_| AppError::Crypto("解密结果不是有效 UTF-8".to_string()))
    }
}
