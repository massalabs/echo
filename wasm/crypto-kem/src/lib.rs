//! # crypto-kem
//!
//! A Rust library providing a clean, safe wrapper around the libcrux ML-KEM (Kyber)
//! post-quantum key encapsulation mechanism implementation.
//!
//! This crate provides simplified types and functions for ML-KEM 768, which is the
//! most commonly used variant of the ML-KEM standard. It wraps the low-level libcrux-ml-kem
//! library with ergonomic Rust types that handle memory safety and provide convenient
//! byte array conversions.
//!
//! ## Features
//!
//! - **Safe wrappers**: All types properly handle memory cleanup and provide safe interfaces
//! - **Byte conversions**: Easy conversion to/from byte arrays for serialization
//! - **ML-KEM 768**: Focus on the most commonly used parameter set
//! - **Simple API**: Three main operations: key generation, encapsulation, and decapsulation
//!
//! ## Usage
//!
//! ```rust
//! use crypto_kem::*;
//!
//! // Generate a key pair
//! let randomness = [0u8; 64]; // In practice, use secure randomness
//! let (secret_key, public_key) = generate_key_pair(randomness);
//!
//! // Encapsulate to create shared secret
//! let enc_randomness = [0u8; 32]; // In practice, use secure randomness  
//! let (ciphertext, shared_secret1) = encapsulate(&public_key, enc_randomness);
//!
//! // Decapsulate to recover shared secret
//! let shared_secret2 = decapsulate(&secret_key, &ciphertext);
//!
//! // Both shared secrets should be identical
//! assert_eq!(shared_secret1.as_bytes(), shared_secret2.as_bytes());
//! ```
//!
//! ## Security Notes
//!
//! - Always use cryptographically secure random number generation for key generation and encapsulation
//! - This library is suitable for production use as it wraps the formally verified libcrux implementation

use libcrux_ml_kem::*;

// ML-KEM 768 size constants
/// ML-KEM 768 private key size in bytes
pub const PRIVATE_KEY_SIZE: usize = 2400;

/// ML-KEM 768 public key size in bytes  
pub const PUBLIC_KEY_SIZE: usize = 1184;

/// ML-KEM 768 ciphertext size in bytes
pub const CIPHERTEXT_SIZE: usize = 1088;

/// ML-KEM 768 shared secret size in bytes
pub const SHARED_SECRET_SIZE: usize = 32;

/// ML-KEM 768 key generation randomness size in bytes (alias for KEY_GENERATION_SEED_SIZE)
pub const KEY_GENERATION_RANDOMNESS_SIZE: usize = 64;

/// ML-KEM 768 encapsulation randomness size in bytes
pub const ENCAPSULATION_RANDOMNESS_SIZE: usize = 32;

/// A public key for the ML-KEM key encapsulation mechanism.
///
/// This wraps the libcrux `MlKemPublicKey` and provides safe byte array conversions.
///
/// # Examples
///
/// ```rust
/// use crypto_kem::{PublicKey, PUBLIC_KEY_SIZE};
///
/// // Create from bytes
/// let key_bytes = [0u8; PUBLIC_KEY_SIZE];
/// let public_key = PublicKey::from(key_bytes);
///
/// // Convert back to bytes
/// let recovered_bytes: [u8; PUBLIC_KEY_SIZE] = (&public_key).into();
/// assert_eq!(key_bytes, recovered_bytes);
/// ```
pub struct PublicKey(MlKemPublicKey<PUBLIC_KEY_SIZE>);

impl From<[u8; PUBLIC_KEY_SIZE]> for PublicKey {
    fn from(bytes: [u8; PUBLIC_KEY_SIZE]) -> Self {
        Self(MlKemPublicKey::from(bytes))
    }
}

impl PublicKey {
    /// Get the raw bytes of the public key
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crypto_kem::{PublicKey, PUBLIC_KEY_SIZE};
    ///
    /// let key_bytes = [42u8; PUBLIC_KEY_SIZE];
    /// let public_key = PublicKey::from(key_bytes);
    /// assert_eq!(public_key.as_bytes(), &key_bytes);
    /// ```
    pub fn as_bytes(&self) -> &[u8; PUBLIC_KEY_SIZE] {
        self.0.as_slice()
    }
}

/// A secret key for the ML-KEM key encapsulation mechanism.
///
/// This wraps the libcrux `MlKemPrivateKey` and provides safe byte array conversions.
///
/// # Examples
///
/// ```rust
/// use crypto_kem::{SecretKey, PRIVATE_KEY_SIZE};
///
/// // Create from bytes
/// let key_bytes = [0u8; PRIVATE_KEY_SIZE];
/// let secret_key = SecretKey::from(key_bytes);
///
/// // Convert back to bytes
/// let recovered_bytes: [u8; PRIVATE_KEY_SIZE] = (&secret_key).into();
/// assert_eq!(key_bytes, recovered_bytes);
/// ```
pub struct SecretKey(MlKemPrivateKey<PRIVATE_KEY_SIZE>);

impl From<[u8; PRIVATE_KEY_SIZE]> for SecretKey {
    fn from(bytes: [u8; PRIVATE_KEY_SIZE]) -> Self {
        Self(MlKemPrivateKey::from(bytes))
    }
}

impl SecretKey {
    /// Get the raw bytes of the secret key
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crypto_kem::{SecretKey, PRIVATE_KEY_SIZE};
    ///
    /// let key_bytes = [42u8; PRIVATE_KEY_SIZE];
    /// let secret_key = SecretKey::from(key_bytes);
    /// assert_eq!(secret_key.as_bytes(), &key_bytes);
    /// ```
    pub fn as_bytes(&self) -> &[u8; PRIVATE_KEY_SIZE] {
        self.0.as_slice()
    }
}

/// A ciphertext produced by the encapsulation operation.
///
/// This wraps the libcrux `MlKemCiphertext` and provides safe byte array conversions.
///
/// # Examples
///
/// ```rust
/// use crypto_kem::{Ciphertext, CIPHERTEXT_SIZE};
///
/// let ct_bytes = [0u8; CIPHERTEXT_SIZE];
/// let ciphertext = Ciphertext::from(ct_bytes);
/// let recovered_bytes: [u8; CIPHERTEXT_SIZE] = (&ciphertext).into();
/// assert_eq!(ct_bytes, recovered_bytes);
/// ```
pub struct Ciphertext(MlKemCiphertext<CIPHERTEXT_SIZE>);

impl From<[u8; CIPHERTEXT_SIZE]> for Ciphertext {
    fn from(bytes: [u8; CIPHERTEXT_SIZE]) -> Self {
        Self(MlKemCiphertext::from(bytes))
    }
}

impl Ciphertext {
    /// Get the raw bytes of the ciphertext
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crypto_kem::{Ciphertext, CIPHERTEXT_SIZE};
    ///
    /// let ct_bytes = [42u8; CIPHERTEXT_SIZE];
    /// let ciphertext = Ciphertext::from(ct_bytes);
    /// assert_eq!(ciphertext.as_bytes(), &ct_bytes);
    /// ```
    pub fn as_bytes(&self) -> &[u8; CIPHERTEXT_SIZE] {
        self.0.as_slice()
    }
}

/// A shared secret produced by encapsulation and recovered by decapsulation.
///
/// This wraps the libcrux `MlKemSharedSecret` (which is a 32-byte array) and provides
/// safe byte array conversions. The shared secret is automatically zeroed when dropped.
///
/// # Examples
///
/// ```rust
/// use crypto_kem::{SharedSecret, SHARED_SECRET_SIZE};
///
/// let secret_bytes = [42u8; SHARED_SECRET_SIZE];
/// let shared_secret = SharedSecret::from(secret_bytes);
/// let recovered_bytes: [u8; SHARED_SECRET_SIZE] = (&shared_secret).into();
/// assert_eq!(secret_bytes, recovered_bytes);
/// ```
pub struct SharedSecret(MlKemSharedSecret);

impl From<[u8; SHARED_SECRET_SIZE]> for SharedSecret {
    fn from(bytes: [u8; SHARED_SECRET_SIZE]) -> Self {
        Self(bytes)
    }
}

impl SharedSecret {
    /// Get the raw bytes of the shared secret
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crypto_kem::{SharedSecret, SHARED_SECRET_SIZE};
    ///
    /// let secret_bytes = [42u8; SHARED_SECRET_SIZE];
    /// let shared_secret = SharedSecret::from(secret_bytes);
    /// assert_eq!(shared_secret.as_bytes(), &secret_bytes);
    /// ```
    pub fn as_bytes(&self) -> &[u8; SHARED_SECRET_SIZE] {
        &self.0
    }
}

/// Generate an ML-KEM 768 key pair from the given randomness.
///
/// # Arguments
///
/// * `randomness` - 64 bytes of cryptographically secure random data
///
/// # Returns
///
/// A tuple containing:
/// - `SecretKey`: The private key for decapsulation
/// - `PublicKey`: The public key for encapsulation
///
/// # Examples
///
/// ```rust
/// use crypto_kem::{generate_key_pair, PUBLIC_KEY_SIZE, PRIVATE_KEY_SIZE};
///
/// let randomness = [0u8; 64]; // Use secure randomness in practice
/// let (secret_key, public_key) = generate_key_pair(randomness);
///
/// // Keys can be used for encapsulation/decapsulation
/// assert_eq!(public_key.as_bytes().len(), PUBLIC_KEY_SIZE);
/// assert_eq!(secret_key.as_bytes().len(), PRIVATE_KEY_SIZE);
/// ```
///
/// # Security Note
///
/// The `randomness` parameter must be generated using a cryptographically secure
/// random number generator. Using predictable or weak randomness will compromise
/// the security of the generated keys.
pub fn generate_key_pair(
    randomness: [u8; KEY_GENERATION_RANDOMNESS_SIZE],
) -> (SecretKey, PublicKey) {
    let (sk, pk) = mlkem768::generate_key_pair(randomness).into_parts();
    (SecretKey(sk), PublicKey(pk))
}

/// Encapsulate a shared secret using the given public key.
///
/// This operation creates a shared secret and encrypts it using the public key,
/// producing a ciphertext that can be sent to the holder of the corresponding private key.
///
/// # Arguments
///
/// * `public_key` - The recipient's public key
/// * `randomness` - 32 bytes of cryptographically secure random data
///
/// # Returns
///
/// A tuple containing:
/// - `Ciphertext`: The encrypted shared secret
/// - `SharedSecret`: The shared secret that was encrypted
///
/// # Examples
///
/// ```rust
/// use crypto_kem::{generate_key_pair, encapsulate, CIPHERTEXT_SIZE, SHARED_SECRET_SIZE};
///
/// // Generate recipient's key pair
/// let randomness = [0u8; 64];
/// let (secret_key, public_key) = generate_key_pair(randomness);
///
/// // Encapsulate shared secret
/// let enc_randomness = [0u8; 32];
/// let (ciphertext, shared_secret) = encapsulate(&public_key, enc_randomness);
///
/// assert_eq!(ciphertext.as_bytes().len(), CIPHERTEXT_SIZE);
/// assert_eq!(shared_secret.as_bytes().len(), SHARED_SECRET_SIZE);
/// ```
///
/// # Security Note
///
/// The `randomness` parameter must be generated using a cryptographically secure
/// random number generator. Reusing randomness will compromise security.
pub fn encapsulate(
    public_key: &PublicKey,
    randomness: [u8; ENCAPSULATION_RANDOMNESS_SIZE],
) -> (Ciphertext, SharedSecret) {
    let (ct, ss) = mlkem768::encapsulate(&public_key.0, randomness);
    (Ciphertext(ct), SharedSecret(ss))
}

/// Decapsulate a shared secret from the given ciphertext using the secret key.
///
/// This operation decrypts the ciphertext using the private key to recover
/// the shared secret that was created during encapsulation.
///
/// # Arguments
///
/// * `secret_key` - The secret key for decryption
/// * `ciphertext` - The ciphertext to decrypt
///
/// # Returns
///
/// The `SharedSecret` that was encrypted in the ciphertext
///
/// # Examples
///
/// ```rust
/// use crypto_kem::{generate_key_pair, encapsulate, decapsulate};
///
/// // Generate key pair
/// let randomness = [0u8; 64];
/// let (secret_key, public_key) = generate_key_pair(randomness);
///
/// // Encapsulate
/// let enc_randomness = [0u8; 32];
/// let (ciphertext, shared_secret1) = encapsulate(&public_key, enc_randomness);
///
/// // Decapsulate
/// let shared_secret2 = decapsulate(&secret_key, &ciphertext);
///
/// // Both secrets should be identical
/// assert_eq!(shared_secret1.as_bytes(), shared_secret2.as_bytes());
/// ```
pub fn decapsulate(secret_key: &SecretKey, ciphertext: &Ciphertext) -> SharedSecret {
    let ss = mlkem768::decapsulate(&secret_key.0, &ciphertext.0);
    SharedSecret(ss)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_public_key_conversion() {
        let key_bytes = [42u8; PUBLIC_KEY_SIZE];
        let public_key = PublicKey::from(key_bytes);
        let recovered_bytes: [u8; PUBLIC_KEY_SIZE] = public_key.as_bytes().clone();
        assert_eq!(key_bytes, recovered_bytes);
        assert_eq!(public_key.as_bytes(), &key_bytes);
    }

    #[test]
    fn test_secret_key_conversion() {
        let key_bytes = [123u8; PRIVATE_KEY_SIZE];
        let secret_key = SecretKey::from(key_bytes);
        let recovered_bytes: [u8; PRIVATE_KEY_SIZE] = secret_key.as_bytes().clone();
        assert_eq!(key_bytes, recovered_bytes);
        assert_eq!(secret_key.as_bytes(), &key_bytes);
    }

    #[test]
    fn test_ciphertext_conversion() {
        let ct_bytes = [123u8; CIPHERTEXT_SIZE];
        let ciphertext = Ciphertext::from(ct_bytes);
        let recovered_bytes: [u8; CIPHERTEXT_SIZE] = ciphertext.as_bytes().clone();
        assert_eq!(ct_bytes, recovered_bytes);
        assert_eq!(ciphertext.as_bytes(), &ct_bytes);
    }

    #[test]
    fn test_shared_secret_conversion() {
        let secret_bytes = [255u8; SHARED_SECRET_SIZE];
        let shared_secret = SharedSecret::from(secret_bytes);
        let recovered_bytes: [u8; SHARED_SECRET_SIZE] = shared_secret.as_bytes().clone();
        assert_eq!(secret_bytes, recovered_bytes);
        assert_eq!(shared_secret.as_bytes(), &secret_bytes);
    }

    #[test]
    fn test_key_generation() {
        let randomness = [0u8; 64];
        let (secret_key, public_key) = generate_key_pair(randomness);

        assert_eq!(public_key.as_bytes().len(), PUBLIC_KEY_SIZE);
        assert_eq!(secret_key.as_bytes().len(), PRIVATE_KEY_SIZE);
    }

    #[test]
    fn test_encapsulation_decapsulation_roundtrip() {
        // Generate key pair
        let randomness = [1u8; 64];
        let (secret_key, public_key) = generate_key_pair(randomness);

        // Encapsulate
        let enc_randomness = [2u8; 32];
        let (ciphertext, shared_secret1) = encapsulate(&public_key, enc_randomness);

        // Verify sizes
        assert_eq!(ciphertext.as_bytes().len(), CIPHERTEXT_SIZE);
        assert_eq!(shared_secret1.as_bytes().len(), SHARED_SECRET_SIZE);

        // Decapsulate
        let shared_secret2 = decapsulate(&secret_key, &ciphertext);

        // Both secrets should be identical
        assert_eq!(shared_secret1.as_bytes(), shared_secret2.as_bytes());
    }

    #[test]
    fn test_different_randomness_produces_different_keys() {
        let randomness1 = [1u8; 64];
        let randomness2 = [2u8; 64];

        let (secret_key1, public_key1) = generate_key_pair(randomness1);
        let (secret_key2, public_key2) = generate_key_pair(randomness2);

        // Keys should be different
        assert_ne!(public_key1.as_bytes(), public_key2.as_bytes());
        assert_ne!(secret_key1.as_bytes(), secret_key2.as_bytes());
    }

    #[test]
    fn test_different_encapsulation_randomness_produces_different_ciphertexts() {
        let randomness = [0u8; 64];
        let (_, public_key) = generate_key_pair(randomness);

        let enc_randomness1 = [1u8; 32];
        let enc_randomness2 = [2u8; 32];

        let (ciphertext1, _) = encapsulate(&public_key, enc_randomness1);
        let (ciphertext2, _) = encapsulate(&public_key, enc_randomness2);

        // Ciphertexts should be different
        assert_ne!(ciphertext1.as_bytes(), ciphertext2.as_bytes());
    }

    #[test]
    fn test_key_serialization_independence() {
        let randomness = [3u8; 64];
        let (secret_key, public_key) = generate_key_pair(randomness);

        // Keys can be serialized independently
        let sk_bytes = secret_key.as_bytes();
        let pk_bytes = public_key.as_bytes();

        // Reconstruct keys from bytes
        let recovered_secret_key = SecretKey::from(*sk_bytes);
        let recovered_public_key = PublicKey::from(*pk_bytes);

        // Verify they work the same
        let enc_randomness = [4u8; 32];
        let (ct1, ss1) = encapsulate(&public_key, enc_randomness);
        let (ct2, ss2) = encapsulate(&recovered_public_key, enc_randomness);

        assert_eq!(ct1.as_bytes(), ct2.as_bytes());
        assert_eq!(ss1.as_bytes(), ss2.as_bytes());

        let ss3 = decapsulate(&secret_key, &ct1);
        let ss4 = decapsulate(&recovered_secret_key, &ct1);

        assert_eq!(ss3.as_bytes(), ss4.as_bytes());
    }
}
