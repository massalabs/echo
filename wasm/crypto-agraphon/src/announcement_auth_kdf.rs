//! Authentication key derivation for announcement messages.
//!
//! This module handles the derivation of the authentication key
//! used to bind authentication data to specific announcements.

use crypto_kdf as kdf;
use crypto_kem as kem;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Key derivation function for announcement authentication.
///
/// This KDF derives the authentication key that binds authentication data
/// to a specific announcement message, preventing replay attacks.
///
/// # Security Properties
///
/// The authentication key binds together:
/// - The authentication pre-key (derived from the announcement root KDF)
/// - The initiator's next public key
///
/// # Cryptographic Details
///
/// Uses HKDF with:
/// - Salt: `"agraphon.auth_kdf.salt.V1----------"`
/// - Inputs: `auth_pre_key`, `pk_next`
/// - Info string: `"agraphon.auth_kdf.auth_key"`
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct AnnouncementAuthKdf {
    /// Authentication key for binding auth data to this specific announcement
    pub(crate) auth_key: [u8; 32],
}

impl AnnouncementAuthKdf {
    /// Derives an authentication key for announcement verification.
    ///
    /// # Arguments
    ///
    /// * `auth_pre_key` - Pre-key derived from the announcement root KDF
    /// * `pk_next` - The initiator's next public key
    ///
    /// # Returns
    ///
    /// An `AnnouncementAuthKdf` containing the derived authentication key.
    ///
    /// # Example Usage (internal)
    ///
    /// ```text
    /// let auth_pre_key = [0u8; 32];
    /// let mut pk_randomness = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut pk_randomness);
    /// let (_, pk_next) = kem::generate_key_pair(pk_randomness);
    ///
    /// let kdf = AnnouncementAuthKdf::new(&auth_pre_key, &pk_next);
    /// kdf.auth_key binds the authentication to this specific announcement
    /// ```
    pub(crate) fn new(auth_pre_key: &[u8; 32], pk_next: &kem::PublicKey) -> Self {
        let mut auth_key = [0u8; 32];

        let mut auth_kdf = kdf::Extract::new(b"agraphon.auth_kdf.salt.V1-------");
        auth_kdf.input_item(auth_pre_key.as_slice());
        auth_kdf.input_item(pk_next.as_bytes());
        let auth_kdf = auth_kdf.finalize();

        auth_kdf.expand(b"agraphon.auth_kdf.auth_key", &mut auth_key);

        Self { auth_key }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto_rng as rng;

    #[test]
    fn test_auth_kdf_deterministic() {
        // Same inputs should produce same output
        let auth_pre_key = [42u8; 32];

        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk_next) = kem::generate_key_pair(pk_rand);

        let kdf1 = AnnouncementAuthKdf::new(&auth_pre_key, &pk_next);
        let kdf2 = AnnouncementAuthKdf::new(&auth_pre_key, &pk_next);

        assert_eq!(kdf1.auth_key, kdf2.auth_key);
    }

    #[test]
    fn test_auth_kdf_different_pre_key() {
        // Different pre-keys should produce different auth keys
        let auth_pre_key1 = [1u8; 32];
        let auth_pre_key2 = [2u8; 32];

        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk_next) = kem::generate_key_pair(pk_rand);

        let kdf1 = AnnouncementAuthKdf::new(&auth_pre_key1, &pk_next);
        let kdf2 = AnnouncementAuthKdf::new(&auth_pre_key2, &pk_next);

        assert_ne!(kdf1.auth_key, kdf2.auth_key);
    }

    #[test]
    fn test_auth_kdf_different_pk() {
        // Different public keys should produce different auth keys
        let auth_pre_key = [42u8; 32];

        let mut pk_rand1 = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand1);
        let (_, pk_next1) = kem::generate_key_pair(pk_rand1);

        let mut pk_rand2 = [1u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand2);
        let (_, pk_next2) = kem::generate_key_pair(pk_rand2);

        let kdf1 = AnnouncementAuthKdf::new(&auth_pre_key, &pk_next1);
        let kdf2 = AnnouncementAuthKdf::new(&auth_pre_key, &pk_next2);

        assert_ne!(kdf1.auth_key, kdf2.auth_key);
    }
}
