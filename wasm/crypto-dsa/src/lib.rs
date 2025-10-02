//! # crypto-dsa
//!
//! A Rust library providing a clean, safe wrapper around the libcrux ML-DSA (Dilithium)
//! post-quantum digital signature algorithm implementation.
//!
//! This crate provides simplified types and functions for ML-DSA 65, which is the
//! most commonly used variant of the ML-DSA standard. It wraps the low-level libcrux-ml-dsa
//! library with ergonomic Rust types that handle memory safety and provide convenient
//! byte array conversions.
//!
//! ## Features
//!
//! - **Safe wrappers**: All types properly handle memory cleanup and provide safe interfaces
//! - **Byte conversions**: Easy conversion to/from byte arrays for serialization
//! - **ML-DSA 65**: Focus on the most commonly used parameter set
//! - **Simple API**: Three main operations: key generation, signing, and verification
//!
//! ## Usage
//!
//! ```rust
//! use crypto_dsa::*;
//!
//! // Generate a key pair
//! let randomness = [0u8; 32]; // In practice, use secure randomness
//! let (signing_key, verification_key) = generate_key_pair(randomness);
//!
//! // Sign a message with empty context
//! let message = b"Hello, world!";
//! let signing_randomness = [0u8; 32]; // In practice, use secure randomness  
//! let signature = sign(&signing_key, message, b"", signing_randomness).unwrap();
//!
//! // Verify the signature with the same empty context
//! let is_valid = verify(&verification_key, message, b"", &signature);
//! assert!(is_valid);
//! ```
//!
//! ## Security Notes
//!
//! - Always use cryptographically secure random number generation for key generation and signing
//! - This library is suitable for production use as it wraps the formally verified libcrux implementation

use libcrux_ml_dsa::*;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

// ML-DSA 65 size constants
/// ML-DSA 65 signing key size in bytes
pub const SIGNING_KEY_SIZE: usize = 4032;

/// ML-DSA 65 verification key size in bytes  
pub const VERIFICATION_KEY_SIZE: usize = 1952;

/// ML-DSA 65 signature size in bytes
pub const SIGNATURE_SIZE: usize = 3309;

/// ML-DSA 65 key generation randomness size in bytes
pub const KEY_GENERATION_RANDOMNESS_SIZE: usize = 32;

/// ML-DSA 65 signing randomness size in bytes
pub const SIGNING_RANDOMNESS_SIZE: usize = 32;

/// A verification key for the ML-DSA digital signature algorithm.
///
/// This wraps the libcrux `MLDSAVerificationKey` and provides safe byte array conversions.
///
/// # Examples
///
/// ```rust
/// use crypto_dsa::{VerificationKey, VERIFICATION_KEY_SIZE};
///
/// // Create from bytes
/// let key_bytes = [0u8; VERIFICATION_KEY_SIZE];
/// let verification_key = VerificationKey::from(key_bytes);
///
/// // Convert back to bytes
/// let recovered_bytes: [u8; VERIFICATION_KEY_SIZE] = *verification_key.as_bytes();
/// assert_eq!(key_bytes, recovered_bytes);
/// ```
pub struct VerificationKey(MLDSAVerificationKey<VERIFICATION_KEY_SIZE>);

impl From<[u8; VERIFICATION_KEY_SIZE]> for VerificationKey {
    fn from(bytes: [u8; VERIFICATION_KEY_SIZE]) -> Self {
        Self(MLDSAVerificationKey::new(bytes))
    }
}

impl Clone for VerificationKey {
    fn clone(&self) -> Self {
        Self(MLDSAVerificationKey::new(*self.0.as_ref()))
    }
}

impl VerificationKey {
    /// Get the raw bytes of the verification key
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crypto_dsa::{VerificationKey, VERIFICATION_KEY_SIZE};
    ///
    /// let key_bytes = [42u8; VERIFICATION_KEY_SIZE];
    /// let verification_key = VerificationKey::from(key_bytes);
    /// assert_eq!(verification_key.as_bytes(), &key_bytes);
    /// ```
    pub fn as_bytes(&self) -> &[u8; VERIFICATION_KEY_SIZE] {
        self.0.as_ref()
    }
}

impl Serialize for VerificationKey {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_bytes(self.as_bytes())
    }
}

impl<'de> Deserialize<'de> for VerificationKey {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let bytes: Zeroizing<Vec<u8>> = Zeroizing::new(Deserialize::deserialize(deserializer)?);
        if bytes.len() != VERIFICATION_KEY_SIZE {
            return Err(serde::de::Error::custom(format!(
                "expected {} bytes, got {}",
                VERIFICATION_KEY_SIZE,
                bytes.len()
            )));
        }
        let mut array = [0u8; VERIFICATION_KEY_SIZE];
        array.copy_from_slice(&bytes);
        Ok(VerificationKey::from(array))
    }
}

impl Zeroize for VerificationKey {
    fn zeroize(&mut self) {
        // Zeroize the underlying bytes through as_ref_mut
        // MLDSAVerificationKey doesn't implement Zeroize, so we access the bytes directly
        self.0.as_ref_mut().zeroize();
    }
}

impl Drop for VerificationKey {
    fn drop(&mut self) {
        self.zeroize();
    }
}

impl ZeroizeOnDrop for VerificationKey {}

/// A signing key for the ML-DSA digital signature algorithm.
///
/// This wraps the libcrux `MLDSASigningKey` and provides safe byte array conversions.
/// **The signing key bytes are automatically and securely zeroed when dropped.**
///
/// # Examples
///
/// ```rust
/// use crypto_dsa::{SigningKey, SIGNING_KEY_SIZE};
///
/// // Create from bytes
/// let key_bytes = [0u8; SIGNING_KEY_SIZE];
/// let signing_key = SigningKey::from(key_bytes);
///
/// // Convert back to bytes
/// let recovered_bytes: [u8; SIGNING_KEY_SIZE] = *signing_key.as_bytes();
/// assert_eq!(key_bytes, recovered_bytes);
/// ```
///
/// # Security
///
/// This type implements `Zeroize` and `ZeroizeOnDrop`, ensuring that the signing key
/// material is securely cleared from memory when the key is dropped. This works even
/// though the underlying `MLDSASigningKey` type does not implement zeroization.
pub struct SigningKey(MLDSASigningKey<SIGNING_KEY_SIZE>);

impl From<[u8; SIGNING_KEY_SIZE]> for SigningKey {
    fn from(bytes: [u8; SIGNING_KEY_SIZE]) -> Self {
        Self(MLDSASigningKey::new(bytes))
    }
}

impl SigningKey {
    /// Get the raw bytes of the signing key
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crypto_dsa::{SigningKey, SIGNING_KEY_SIZE};
    ///
    /// let key_bytes = [42u8; SIGNING_KEY_SIZE];
    /// let signing_key = SigningKey::from(key_bytes);
    /// assert_eq!(signing_key.as_bytes(), &key_bytes);
    /// ```
    pub fn as_bytes(&self) -> &[u8; SIGNING_KEY_SIZE] {
        self.0.as_ref()
    }
}

impl Serialize for SigningKey {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_bytes(self.as_bytes())
    }
}

impl<'de> Deserialize<'de> for SigningKey {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let bytes: Zeroizing<Vec<u8>> = Zeroizing::new(Deserialize::deserialize(deserializer)?);
        if bytes.len() != SIGNING_KEY_SIZE {
            return Err(serde::de::Error::custom(format!(
                "expected {} bytes, got {}",
                SIGNING_KEY_SIZE,
                bytes.len()
            )));
        }
        let mut array = [0u8; SIGNING_KEY_SIZE];
        array.copy_from_slice(&bytes);
        Ok(SigningKey::from(array))
    }
}

impl Zeroize for SigningKey {
    fn zeroize(&mut self) {
        // CRITICAL: Zeroize the underlying bytes through as_ref_mut
        // This is essential because MLDSASigningKey doesn't implement Zeroize
        // We access the bytes directly before they're dropped
        self.0.as_ref_mut().zeroize();
    }
}

impl Drop for SigningKey {
    fn drop(&mut self) {
        self.zeroize();
    }
}

impl ZeroizeOnDrop for SigningKey {}

/// A signature produced by the signing operation.
///
/// This wraps the libcrux `MLDSASignature` and provides safe byte array conversions.
///
/// # Examples
///
/// ```rust
/// use crypto_dsa::{Signature, SIGNATURE_SIZE};
///
/// let sig_bytes = [0u8; SIGNATURE_SIZE];
/// let signature = Signature::from(sig_bytes);
/// let recovered_bytes: [u8; SIGNATURE_SIZE] = *signature.as_bytes();
/// assert_eq!(sig_bytes, recovered_bytes);
/// ```
pub struct Signature(MLDSASignature<SIGNATURE_SIZE>);

impl From<[u8; SIGNATURE_SIZE]> for Signature {
    fn from(bytes: [u8; SIGNATURE_SIZE]) -> Self {
        Self(MLDSASignature::new(bytes))
    }
}

impl Signature {
    /// Get the raw bytes of the signature
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crypto_dsa::{Signature, SIGNATURE_SIZE};
    ///
    /// let sig_bytes = [42u8; SIGNATURE_SIZE];
    /// let signature = Signature::from(sig_bytes);
    /// assert_eq!(signature.as_bytes(), &sig_bytes);
    /// ```
    pub fn as_bytes(&self) -> &[u8; SIGNATURE_SIZE] {
        self.0.as_ref()
    }
}

impl Serialize for Signature {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_bytes(self.as_bytes())
    }
}

impl<'de> Deserialize<'de> for Signature {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let bytes: Zeroizing<Vec<u8>> = Zeroizing::new(Deserialize::deserialize(deserializer)?);
        if bytes.len() != SIGNATURE_SIZE {
            return Err(serde::de::Error::custom(format!(
                "expected {} bytes, got {}",
                SIGNATURE_SIZE,
                bytes.len()
            )));
        }
        let mut array = [0u8; SIGNATURE_SIZE];
        array.copy_from_slice(&bytes);
        Ok(Signature::from(array))
    }
}

impl Zeroize for Signature {
    fn zeroize(&mut self) {
        // Zeroize the underlying bytes through as_ref_mut
        // MLDSASignature doesn't implement Zeroize, so we access the bytes directly
        self.0.as_ref_mut().zeroize();
    }
}

impl Drop for Signature {
    fn drop(&mut self) {
        self.zeroize();
    }
}

impl ZeroizeOnDrop for Signature {}

/// Generate an ML-DSA 65 key pair from the given randomness.
///
/// # Arguments
///
/// * `randomness` - 32 bytes of cryptographically secure random data
///
/// # Returns
///
/// A tuple containing:
/// - `SigningKey`: The private key for signing
/// - `VerificationKey`: The public key for verification
///
/// # Examples
///
/// ```rust
/// use crypto_dsa::{generate_key_pair, VERIFICATION_KEY_SIZE, SIGNING_KEY_SIZE};
///
/// let randomness = [0u8; 32]; // Use secure randomness in practice
/// let (signing_key, verification_key) = generate_key_pair(randomness);
///
/// // Keys can be used for signing/verification
/// assert_eq!(verification_key.as_bytes().len(), VERIFICATION_KEY_SIZE);
/// assert_eq!(signing_key.as_bytes().len(), SIGNING_KEY_SIZE);
/// ```
///
/// # Security Note
///
/// The `randomness` parameter must be generated using a cryptographically secure
/// random number generator. Using predictable or weak randomness will compromise
/// the security of the generated keys.
pub fn generate_key_pair(
    randomness: [u8; KEY_GENERATION_RANDOMNESS_SIZE],
) -> (SigningKey, VerificationKey) {
    let kp = ml_dsa_65::generate_key_pair(randomness);
    (
        SigningKey(kp.signing_key),
        VerificationKey(kp.verification_key),
    )
}

/// Sign a message using the given signing key.
///
/// This operation creates a signature for the given message using the signing key.
/// The `context` parameter is used for domain separation and may be empty.
///
/// # Arguments
///
/// * `signing_key` - The signing key to use
/// * `message` - The raw message to sign (any length, no pre-hashing required)
/// * `context` - Domain separation context (max 255 bytes, or empty)
/// * `randomness` - 32 bytes of cryptographically secure random data
///
/// # Returns
///
/// A `Result` containing a `Signature` that can be used to verify the message,
/// or a `SigningError` if signing fails.
///
/// # Examples
///
/// ```rust
/// use crypto_dsa::{generate_key_pair, sign, SIGNATURE_SIZE};
///
/// // Generate signer's key pair
/// let randomness = [0u8; 32];
/// let (signing_key, verification_key) = generate_key_pair(randomness);
///
/// // Sign a raw message with empty context (no pre-hashing needed)
/// let message = b"Hello, world!";
/// let signing_randomness = [0u8; 32];
/// let signature = sign(&signing_key, message, b"", signing_randomness).unwrap();
///
/// assert_eq!(signature.as_bytes().len(), SIGNATURE_SIZE);
/// ```
///
/// # Security Notes
///
/// - **No pre-hashing required**: Unlike traditional DSA schemes (e.g., ECDSA), ML-DSA
///   is designed to sign raw messages directly. The algorithm performs its own internal
///   hashing (SHAKE256) as part of the signing process. You should pass your raw message
///   without pre-hashing it.
/// - **Randomness**: The `randomness` parameter must be generated using a cryptographically
///   secure random number generator. Reusing randomness or using predictable values will
///   compromise security.
/// - **Context**: The optional `context` parameter provides domain separation. Use it to
///   distinguish signatures from different applications or protocols.
pub fn sign(
    signing_key: &SigningKey,
    message: &[u8],
    context: &[u8],
    randomness: [u8; SIGNING_RANDOMNESS_SIZE],
) -> Result<Signature, SigningError> {
    let sig = ml_dsa_65::sign(&signing_key.0, message, context, randomness)?;
    Ok(Signature(sig))
}

/// Verify a signature on a message using the given verification key.
///
/// This operation verifies that the signature was created by the holder of the
/// corresponding signing key for the given message.
/// The `context` parameter must match the one used during signing.
///
/// # Arguments
///
/// * `verification_key` - The verification key to use
/// * `message` - The message that was signed
/// * `context` - Domain separation context (must match signing context)
/// * `signature` - The signature to verify
///
/// # Returns
///
/// `true` if the signature is valid, `false` otherwise
///
/// # Examples
///
/// ```rust
/// use crypto_dsa::{generate_key_pair, sign, verify};
///
/// // Generate key pair
/// let randomness = [0u8; 32];
/// let (signing_key, verification_key) = generate_key_pair(randomness);
///
/// // Sign a message with empty context
/// let message = b"Hello, world!";
/// let signing_randomness = [0u8; 32];
/// let signature = sign(&signing_key, message, b"", signing_randomness).unwrap();
///
/// // Verify the signature with same empty context
/// let is_valid = verify(&verification_key, message, b"", &signature);
/// assert!(is_valid);
///
/// // Signature should fail for different message
/// let other_message = b"Goodbye, world!";
/// let is_invalid = verify(&verification_key, other_message, b"", &signature);
/// assert!(!is_invalid);
/// ```
pub fn verify(
    verification_key: &VerificationKey,
    message: &[u8],
    context: &[u8],
    signature: &Signature,
) -> bool {
    ml_dsa_65::verify(&verification_key.0, message, context, &signature.0).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verification_key_conversion() {
        let key_bytes = [42u8; VERIFICATION_KEY_SIZE];
        let verification_key = VerificationKey::from(key_bytes);
        let recovered_bytes: [u8; VERIFICATION_KEY_SIZE] = verification_key.as_bytes().clone();
        assert_eq!(key_bytes, recovered_bytes);
        assert_eq!(verification_key.as_bytes(), &key_bytes);
    }

    #[test]
    fn test_signing_key_conversion() {
        let key_bytes = [123u8; SIGNING_KEY_SIZE];
        let signing_key = SigningKey::from(key_bytes);
        let recovered_bytes: [u8; SIGNING_KEY_SIZE] = signing_key.as_bytes().clone();
        assert_eq!(key_bytes, recovered_bytes);
        assert_eq!(signing_key.as_bytes(), &key_bytes);
    }

    #[test]
    fn test_signature_conversion() {
        let sig_bytes = [123u8; SIGNATURE_SIZE];
        let signature = Signature::from(sig_bytes);
        let recovered_bytes: [u8; SIGNATURE_SIZE] = signature.as_bytes().clone();
        assert_eq!(sig_bytes, recovered_bytes);
        assert_eq!(signature.as_bytes(), &sig_bytes);
    }

    #[test]
    fn test_key_generation() {
        let randomness = [0u8; 32];
        let (signing_key, verification_key) = generate_key_pair(randomness);

        assert_eq!(verification_key.as_bytes().len(), VERIFICATION_KEY_SIZE);
        assert_eq!(signing_key.as_bytes().len(), SIGNING_KEY_SIZE);
    }

    #[test]
    fn test_sign_verify_roundtrip() {
        // Generate key pair
        let randomness = [1u8; 32];
        let (signing_key, verification_key) = generate_key_pair(randomness);

        // Sign a message with empty context
        let message = b"Hello, world!";
        let signing_randomness = [2u8; 32];
        let signature = sign(&signing_key, message, b"", signing_randomness).unwrap();

        // Verify size
        assert_eq!(signature.as_bytes().len(), SIGNATURE_SIZE);

        // Verify signature
        let is_valid = verify(&verification_key, message, b"", &signature);
        assert!(is_valid);

        // Verify fails for different message
        let other_message = b"Goodbye, world!";
        let is_invalid = verify(&verification_key, other_message, b"", &signature);
        assert!(!is_invalid);
    }

    #[test]
    fn test_different_randomness_produces_different_keys() {
        let randomness1 = [1u8; 32];
        let randomness2 = [2u8; 32];

        let (signing_key1, verification_key1) = generate_key_pair(randomness1);
        let (signing_key2, verification_key2) = generate_key_pair(randomness2);

        // Keys should be different
        assert_ne!(verification_key1.as_bytes(), verification_key2.as_bytes());
        assert_ne!(signing_key1.as_bytes(), signing_key2.as_bytes());
    }

    #[test]
    fn test_different_signing_randomness_produces_different_signatures() {
        let randomness = [0u8; 32];
        let (signing_key, _) = generate_key_pair(randomness);

        let message = b"Test message";
        let signing_randomness1 = [1u8; 32];
        let signing_randomness2 = [2u8; 32];

        let signature1 = sign(&signing_key, message, b"", signing_randomness1).unwrap();
        let signature2 = sign(&signing_key, message, b"", signing_randomness2).unwrap();

        // Signatures should be different
        assert_ne!(signature1.as_bytes(), signature2.as_bytes());
    }

    #[test]
    fn test_key_serialization_independence() {
        let randomness = [3u8; 32];
        let (signing_key, verification_key) = generate_key_pair(randomness);

        // Keys can be serialized independently
        let sk_bytes = signing_key.as_bytes();
        let vk_bytes = verification_key.as_bytes();

        // Reconstruct keys from bytes
        let recovered_signing_key = SigningKey::from(*sk_bytes);
        let recovered_verification_key = VerificationKey::from(*vk_bytes);

        // Verify they work the same
        let message = b"Test message";
        let signing_randomness = [4u8; 32];

        let sig1 = sign(&signing_key, message, b"", signing_randomness).unwrap();
        let sig2 = sign(&recovered_signing_key, message, b"", signing_randomness).unwrap();

        assert_eq!(sig1.as_bytes(), sig2.as_bytes());

        let is_valid1 = verify(&verification_key, message, b"", &sig1);
        let is_valid2 = verify(&recovered_verification_key, message, b"", &sig1);

        assert!(is_valid1);
        assert!(is_valid2);
    }

    #[test]
    fn test_cross_key_verification_fails() {
        let randomness1 = [5u8; 32];
        let randomness2 = [6u8; 32];

        let (signing_key1, verification_key1) = generate_key_pair(randomness1);
        let (_, verification_key2) = generate_key_pair(randomness2);

        let message = b"Test message";
        let signing_randomness = [7u8; 32];
        let signature = sign(&signing_key1, message, b"", signing_randomness).unwrap();

        // Should verify with correct key
        assert!(verify(&verification_key1, message, b"", &signature));

        // Should NOT verify with different key
        assert!(!verify(&verification_key2, message, b"", &signature));
    }
}
