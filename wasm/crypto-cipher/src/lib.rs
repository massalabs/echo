//! # crypto-cipher
//!
//! A minimal Rust library providing AES-256-CTR symmetric encryption.
//!
//! This crate provides a simple interface for AES-256 in counter (CTR) mode.
//! CTR mode turns a block cipher into a stream cipher, allowing encryption of arbitrary
//! length data without padding.
//!
//! ## Features
//!
//! - **AES-256**: Strong 256-bit key encryption
//! - **CTR mode**: Stream cipher mode for arbitrary length data
//! - **No authentication**: This is encryption only, not AEAD (no built-in authentication)
//! - **Simple API**: Just two in-place functions
//!
//! ## Security Notes
//!
//! - **No authentication**: This crate provides encryption only. For authenticated encryption,
//!   you should combine this with a MAC (Message Authentication Code) or use an AEAD cipher.
//! - **Message length leaked**: CTR mode does not use padding, so the ciphertext length
//!   exactly matches the plaintext length, revealing the message size to observers.
//! - **Nonce reuse is catastrophic**: Never reuse the same key/nonce pair. Each encryption
//!   must use a unique nonce for a given key.
//! - **Post-quantum**: AES-256 is considered quantum-resistant (Grover's algorithm reduces
//!   effective key space to 128 bits, which is still secure).
//!
//! ## Usage
//!
//! ```rust
//! use crypto_cipher::*;
//!
//! // Create a key and nonce
//! let key = Key::from([42u8; KEY_SIZE]);
//! let nonce = Nonce::from([1u8; NONCE_SIZE]);
//!
//! // Encrypt some data in-place
//! let mut data = b"Hello, world!".to_vec();
//! encrypt(&key, &nonce, &mut data);
//!
//! // Decrypt the data in-place
//! decrypt(&key, &nonce, &mut data);
//!
//! assert_eq!(&data, b"Hello, world!");
//! ```

use aes::Aes256;
use ctr::{
    Ctr128BE,
    cipher::{KeyIvInit, StreamCipher},
};
use zeroize::ZeroizeOnDrop;

/// AES-256 key size in bytes (256 bits)
pub const KEY_SIZE: usize = 32;

/// AES-CTR nonce/IV size in bytes (128 bits)
///
/// In CTR mode, this is the initial counter value. The counter is 128 bits
/// for AES, typically split into a nonce and a counter portion.
pub const NONCE_SIZE: usize = 16;

/// Type alias for AES-256 in CTR mode with 128-bit big-endian counter
type Aes256Ctr = Ctr128BE<Aes256>;

/// A nonce/IV for AES-256-CTR encryption.
///
/// This wraps a 128-bit nonce and provides safe byte array conversions.
/// The nonce is automatically zeroed when dropped.
///
/// # Examples
///
/// ```rust
/// use crypto_cipher::{Nonce, NONCE_SIZE};
///
/// // Create from bytes
/// let nonce_bytes = [1u8; NONCE_SIZE];
/// let nonce = Nonce::from(nonce_bytes);
///
/// // Get bytes back
/// assert_eq!(nonce.as_bytes(), &nonce_bytes);
/// ```
#[derive(ZeroizeOnDrop)]
pub struct Nonce([u8; NONCE_SIZE]);

impl From<[u8; NONCE_SIZE]> for Nonce {
    fn from(bytes: [u8; NONCE_SIZE]) -> Self {
        Self(bytes)
    }
}

impl Nonce {
    /// Get the raw bytes of the nonce
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crypto_cipher::{Nonce, NONCE_SIZE};
    ///
    /// let nonce_bytes = [42u8; NONCE_SIZE];
    /// let nonce = Nonce::from(nonce_bytes);
    /// assert_eq!(nonce.as_bytes(), &nonce_bytes);
    /// ```
    pub fn as_bytes(&self) -> &[u8; NONCE_SIZE] {
        &self.0
    }
}

/// A key for AES-256-CTR encryption.
///
/// This wraps a 256-bit key and provides safe byte array conversions.
/// The key is automatically zeroed when dropped.
///
/// # Examples
///
/// ```rust
/// use crypto_cipher::{Key, KEY_SIZE};
///
/// // Create from bytes
/// let key_bytes = [42u8; KEY_SIZE];
/// let key = Key::from(key_bytes);
///
/// // Get bytes back
/// assert_eq!(key.as_bytes(), &key_bytes);
/// ```
#[derive(ZeroizeOnDrop)]
pub struct Key([u8; KEY_SIZE]);

impl From<[u8; KEY_SIZE]> for Key {
    fn from(bytes: [u8; KEY_SIZE]) -> Self {
        Self(bytes)
    }
}

impl Key {
    /// Get the raw bytes of the key
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crypto_cipher::{Key, KEY_SIZE};
    ///
    /// let key_bytes = [42u8; KEY_SIZE];
    /// let key = Key::from(key_bytes);
    /// assert_eq!(key.as_bytes(), &key_bytes);
    /// ```
    pub fn as_bytes(&self) -> &[u8; KEY_SIZE] {
        &self.0
    }
}

/// Encrypts data in-place using AES-256-CTR.
///
/// CTR mode encrypts data by XORing it with a keystream generated from the key
/// and nonce. This function modifies the buffer in-place.
///
/// # Arguments
///
/// * `key` - A 256-bit (32-byte) encryption key
/// * `nonce` - A 128-bit (16-byte) nonce/IV. Must be unique for each encryption with the same key
/// * `buffer` - The data to encrypt (modified in-place)
///
/// # Examples
///
/// ```rust
/// use crypto_cipher::{encrypt, Key, Nonce, KEY_SIZE, NONCE_SIZE};
///
/// let key = Key::from([0u8; KEY_SIZE]);
/// let nonce = Nonce::from([1u8; NONCE_SIZE]);
/// let mut data = b"Secret message".to_vec();
/// let original = data.clone();
///
/// encrypt(&key, &nonce, &mut data);
/// assert_ne!(data, original);
/// ```
///
/// # Security Note
///
/// Never reuse a nonce with the same key. Nonce reuse in CTR mode completely
/// breaks the security of the encryption.
pub fn encrypt(key: &Key, nonce: &Nonce, buffer: &mut [u8]) {
    let mut cipher = Aes256Ctr::new(key.as_bytes().into(), nonce.as_bytes().into());
    cipher.apply_keystream(buffer);
}

/// Decrypts data in-place using AES-256-CTR.
///
/// Due to the symmetric nature of XOR in CTR mode, decryption is identical
/// to encryption. This function is provided for API clarity and modifies
/// the buffer in-place.
///
/// # Arguments
///
/// * `key` - A 256-bit (32-byte) encryption key (must match the encryption key)
/// * `nonce` - A 128-bit (16-byte) nonce/IV (must match the encryption nonce)
/// * `buffer` - The data to decrypt (modified in-place)
///
/// # Examples
///
/// ```rust
/// use crypto_cipher::{encrypt, decrypt, Key, Nonce, KEY_SIZE, NONCE_SIZE};
///
/// let key = Key::from([0u8; KEY_SIZE]);
/// let nonce = Nonce::from([1u8; NONCE_SIZE]);
/// let original = b"Secret message";
/// let mut data = original.to_vec();
///
/// encrypt(&key, &nonce, &mut data);
/// decrypt(&key, &nonce, &mut data);
///
/// assert_eq!(data.as_slice(), original);
/// ```
pub fn decrypt(key: &Key, nonce: &Nonce, buffer: &mut [u8]) {
    // In CTR mode, encryption and decryption are the same operation
    let mut cipher = Aes256Ctr::new(key.as_bytes().into(), nonce.as_bytes().into());
    cipher.apply_keystream(buffer);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = Key::from([42u8; KEY_SIZE]);
        let nonce = Nonce::from([1u8; NONCE_SIZE]);
        let original = b"Hello, world! This is a test message.";
        let mut buffer = original.to_vec();

        encrypt(&key, &nonce, &mut buffer);
        assert_ne!(buffer.as_slice(), original);

        decrypt(&key, &nonce, &mut buffer);
        assert_eq!(buffer.as_slice(), original);
    }

    #[test]
    fn test_ciphertext_differs_from_plaintext() {
        let key = Key::from([42u8; KEY_SIZE]);
        let nonce = Nonce::from([1u8; NONCE_SIZE]);
        let original = b"Hello, world!";
        let mut buffer = original.to_vec();

        encrypt(&key, &nonce, &mut buffer);

        assert_ne!(buffer.as_slice(), original);
    }

    #[test]
    fn test_different_keys_produce_different_ciphertexts() {
        let key1 = Key::from([1u8; KEY_SIZE]);
        let key2 = Key::from([2u8; KEY_SIZE]);
        let nonce = Nonce::from([0u8; NONCE_SIZE]);
        let plaintext = b"Test message";

        let mut ciphertext1 = plaintext.to_vec();
        let mut ciphertext2 = plaintext.to_vec();

        encrypt(&key1, &nonce, &mut ciphertext1);
        encrypt(&key2, &nonce, &mut ciphertext2);

        assert_ne!(ciphertext1, ciphertext2);
    }

    #[test]
    fn test_different_nonces_produce_different_ciphertexts() {
        let key = Key::from([0u8; KEY_SIZE]);
        let nonce1 = Nonce::from([1u8; NONCE_SIZE]);
        let nonce2 = Nonce::from([2u8; NONCE_SIZE]);
        let plaintext = b"Test message";

        let mut ciphertext1 = plaintext.to_vec();
        let mut ciphertext2 = plaintext.to_vec();

        encrypt(&key, &nonce1, &mut ciphertext1);
        encrypt(&key, &nonce2, &mut ciphertext2);

        assert_ne!(ciphertext1, ciphertext2);
    }

    #[test]
    fn test_empty_buffer() {
        let key = Key::from([0u8; KEY_SIZE]);
        let nonce = Nonce::from([0u8; NONCE_SIZE]);
        let mut buffer = vec![];

        encrypt(&key, &nonce, &mut buffer);
        decrypt(&key, &nonce, &mut buffer);

        assert_eq!(buffer.len(), 0);
    }

    #[test]
    fn test_large_data() {
        let key = Key::from([123u8; KEY_SIZE]);
        let nonce = Nonce::from([45u8; NONCE_SIZE]);
        let plaintext = vec![42u8; 10000];
        let mut buffer = plaintext.clone();

        encrypt(&key, &nonce, &mut buffer);
        assert_ne!(buffer, plaintext);

        decrypt(&key, &nonce, &mut buffer);
        assert_eq!(buffer, plaintext);
    }

    #[test]
    fn test_deterministic_encryption() {
        let key = Key::from([99u8; KEY_SIZE]);
        let nonce = Nonce::from([88u8; NONCE_SIZE]);
        let plaintext = b"Deterministic test";

        let mut ciphertext1 = plaintext.to_vec();
        let mut ciphertext2 = plaintext.to_vec();

        encrypt(&key, &nonce, &mut ciphertext1);
        encrypt(&key, &nonce, &mut ciphertext2);

        // Same key, nonce, and plaintext should produce identical ciphertext
        assert_eq!(ciphertext1, ciphertext2);
    }

    #[test]
    fn test_encrypt_decrypt_same_operation() {
        let key = Key::from([7u8; KEY_SIZE]);
        let nonce = Nonce::from([3u8; NONCE_SIZE]);
        let plaintext = b"Test symmetry";

        let mut buffer1 = plaintext.to_vec();
        let mut buffer2 = plaintext.to_vec();

        // Encrypt with encrypt function
        encrypt(&key, &nonce, &mut buffer1);

        // "Encrypt" with decrypt function (should be same in CTR mode)
        decrypt(&key, &nonce, &mut buffer2);

        // Should produce identical results
        assert_eq!(buffer1, buffer2);
    }
}
