//! Password-based Key Derivation Function (Password KDF)
//!
//! This crate provides a secure password-based key derivation function using Argon2id,
//! optimized for single-core WASM and mobile devices while maintaining high security.
//!
//! # Overview
//!
//! Argon2id is the recommended password hashing algorithm, combining:
//! - **Memory hardness**: Resistant to GPU/ASIC attacks
//! - **Time hardness**: Configurable iterations
//! - **Side-channel resistance**: Hybrid of Argon2i and Argon2d
//!
//! # Security Features
//!
//! - **Memory-hard hashing**: Makes brute-force attacks expensive
//! - **Optimized for mobile/WASM**: Single-threaded with moderate memory usage
//! - **Salt support**: Prevents rainbow table attacks
//! - **Quantum-resistant**: Based on symmetric cryptography (128-bit security)
//! - **Memory safety**: Uses external buffers for input and output
//! - **Panics**: Panics if anything invalid is detected
//!
//! # Example
//!
//! ```
//! use crypto_password_kdf::derive;
//!
//! // Derive a key from a password and salt
//! let password = b"my-secure-password";
//! let salt = b"unique-salt-per-user";
//! let mut derived_key = [0u8; 32];
//!
//! derive(password, salt, &mut derived_key);
//!
//! // The derived key can now be used for encryption or authentication
//! ```

use argon2::{Algorithm, Argon2, ParamsBuilder, Version};

/// Derives a cryptographic key from a password using Argon2id.
///
/// This function uses parameters optimized for single-core WASM and mobile devices:
/// - **Memory**: 32 MiB (32768 KiB) - Balanced for mobile constraints
/// - **Iterations**: 4 - Higher time cost compensates for lower parallelism
/// - **Parallelism**: 1 thread - Optimized for single-core WASM
///
/// These parameters maintain high security while being practical for resource-constrained
/// environments. The function typically takes 1-3 seconds on modern mobile devices.
///
/// # Arguments
///
/// * `password` - The password to derive the key from
/// * `salt` - A unique salt value (minimum 8 bytes, recommended 16+ bytes)
/// * `output_buffer` - The buffer to fill with the derived key material
///
/// # Security Considerations
///
/// - **Salt**: Always use a unique, random salt per user/password
/// - **Salt length**: Minimum 8 bytes (enforced), recommended 16+ bytes
/// - **Salt storage**: Salts should be stored alongside the derived key hash
/// - **Key storage**: Derived keys should be handled securely and cleared when done
///
/// # Panics
///
/// Panics if:
/// - The salt is too short (< 8 bytes)
/// - The output buffer is too large (> 2^32 - 1 bytes)
/// - The Argon2 derivation fails
///
/// # Example
///
/// ```
/// use crypto_password_kdf::derive;
///
/// let password = b"correct horse battery staple";
/// let salt = b"unique-per-user-salt";
/// let mut derived_key = [0u8; 32];
///
/// derive(password, salt, &mut derived_key);
///
/// // Use derived_key for encryption or authentication
/// assert_ne!(derived_key, [0u8; 32]);
/// ```
pub fn derive(password: &[u8], salt: &[u8], output_buffer: &mut [u8]) {
    // Validate salt length (minimum 8 bytes per Argon2 spec)
    assert!(
        salt.len() >= 8,
        "Salt must be at least 8 bytes, got {} bytes",
        salt.len()
    );

    // Parameters optimized for single-core WASM and mobile devices
    // while maintaining high security (128-bit equivalent)
    let params = ParamsBuilder::new()
        .m_cost(32768) // 32 MiB - Reasonable for mobile devices
        .t_cost(4) // 4 iterations - Higher to compensate for single thread
        .p_cost(1) // 1 thread - Single-core for WASM compatibility
        .build()
        .expect("Invalid Argon2 parameters");

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    // Perform the key derivation
    argon2
        .hash_password_into(password, salt, output_buffer)
        .expect("Argon2 key derivation failed");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_derivation() {
        let password = b"test-password";
        let salt = b"test-salt-16bytes";
        let mut key = [0u8; 32];

        derive(password, salt, &mut key);

        // Key should not be all zeros
        assert_ne!(key, [0u8; 32]);
    }

    #[test]
    fn test_different_passwords_produce_different_keys() {
        let salt = b"common-salt-16bytes";

        let mut key1 = [0u8; 32];
        let mut key2 = [0u8; 32];

        derive(b"password1", salt, &mut key1);
        derive(b"password2", salt, &mut key2);

        assert_ne!(key1, key2);
    }

    #[test]
    fn test_different_salts_produce_different_keys() {
        let password = b"same-password";

        let mut key1 = [0u8; 32];
        let mut key2 = [0u8; 32];

        derive(password, b"salt1-16-bytes!!", &mut key1);
        derive(password, b"salt2-16-bytes!!", &mut key2);

        assert_ne!(key1, key2);
    }

    #[test]
    fn test_reproducibility() {
        let password = b"reproducible";
        let salt = b"fixed-salt-16bytes";

        let mut key1 = [0u8; 32];
        let mut key2 = [0u8; 32];

        derive(password, salt, &mut key1);
        derive(password, salt, &mut key2);

        // Same inputs should produce same output
        assert_eq!(key1, key2);
    }

    #[test]
    fn test_variable_output_lengths() {
        let password = b"test-password";
        let salt = b"test-salt-16bytes";

        let mut key16 = [0u8; 16];
        let mut key32 = [0u8; 32];
        let mut key64 = [0u8; 64];

        derive(password, salt, &mut key16);
        derive(password, salt, &mut key32);
        derive(password, salt, &mut key64);

        // All keys should be non-zero
        assert_ne!(key16, [0u8; 16]);
        assert_ne!(key32, [0u8; 32]);
        assert_ne!(key64, [0u8; 64]);
    }

    #[test]
    #[should_panic(expected = "Salt must be at least 8 bytes")]
    fn test_short_salt_panics() {
        let password = b"test-password";
        let salt = b"short"; // Only 5 bytes
        let mut key = [0u8; 32];

        derive(password, salt, &mut key);
    }

    #[test]
    fn test_minimum_salt_length() {
        let password = b"test-password";
        let salt = b"8bytesok"; // Exactly 8 bytes (minimum)
        let mut key = [0u8; 32];

        derive(password, salt, &mut key);

        assert_ne!(key, [0u8; 32]);
    }

    #[test]
    fn test_empty_password() {
        let password = b"";
        let salt = b"test-salt-16bytes";
        let mut key = [0u8; 32];

        derive(password, salt, &mut key);

        // Even empty password should produce a key
        assert_ne!(key, [0u8; 32]);
    }

    #[test]
    fn test_long_password() {
        let password = b"this is a very long password that exceeds the typical length of passwords but should still work correctly";
        let salt = b"test-salt-16bytes";
        let mut key = [0u8; 32];

        derive(password, salt, &mut key);

        assert_ne!(key, [0u8; 32]);
    }
}
