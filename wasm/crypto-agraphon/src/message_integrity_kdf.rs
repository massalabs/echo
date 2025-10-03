//! Message integrity verification and next-state derivation.
//!
//! This module handles the final stage of message processing, deriving both
//! an integrity key for message authentication and the next state values
//! for the ratchet.

use crypto_kdf as kdf;
use crypto_kem as kem;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Key derivation function for message integrity and next state.
///
/// After decrypting a message, this KDF is used to:
/// 1. Derive an integrity key to authenticate the message contents
/// 2. Derive the next master key for the ratchet
/// 3. Derive the next seeker seed for future message identification
///
/// # Security Properties
///
/// The integrity key binds together:
/// - The integrity seed (derived from the message root)
/// - The sender's next public key
/// - The message payload
///
/// This provides authenticated encryption with associated data (AEAD), where
/// the next public key serves as additional authenticated data.
///
/// # Cryptographic Details
///
/// Uses HKDF with:
/// - Salt: `"session.integrity_kdf.salt------"`
/// - Inputs: `integrity_seed`, `pk_next`, payload
/// - Info strings: `"session.integrity_kdf.mk_next"`, `"session.integrity_kdf.integrity_key"`,
///   and `"session.integrity_kdf.seeker_next"`
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct MessageIntegrityKdf {
    /// Next master key for the ratchet
    pub(crate) mk_next: [u8; 32],
    /// Integrity key for message authentication
    pub(crate) integrity_key: [u8; 32],
    /// Next seeker seed for message identification
    pub(crate) seeker_next: [u8; 32],
}

impl MessageIntegrityKdf {
    /// Derives integrity and next-state keys from message components.
    ///
    /// # Arguments
    ///
    /// * `integrity_seed` - Seed derived from the message root KDF
    /// * `pk_next` - The sender's next public key (embedded in the message)
    /// * `payload` - The message payload
    ///
    /// # Returns
    ///
    /// A `MessageIntegrityKdf` containing the derived keys and seeds.
    ///
    /// # Example Usage (internal)
    ///
    /// ```text
    /// let integrity_seed = [0u8; 32];
    /// let mut pk_randomness = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut pk_randomness);
    /// let (_, pk_next) = kem::generate_key_pair(pk_randomness);
    /// let payload = b"Hello, world!";
    ///
    /// let kdf = MessageIntegrityKdf::new(&integrity_seed, &pk_next, payload);
    /// // kdf.integrity_key can be used to verify the message
    /// // kdf.mk_next and kdf.seeker_next are stored for the next message
    /// ```
    pub(crate) fn new(integrity_seed: &[u8; 32], pk_next: &kem::PublicKey, payload: &[u8]) -> Self {
        let mut mk_next = [0u8; 32];
        let mut integrity_key = [0u8; 32];
        let mut seeker_next = [0u8; 32];
        let mut integrity_kdf = kdf::Extract::new(b"session.integrity_kdf.salt------");
        integrity_kdf.input_item(integrity_seed.as_slice());
        integrity_kdf.input_item(pk_next.as_bytes());
        integrity_kdf.input_item(payload);
        let integrity_kdf = integrity_kdf.finalize();
        integrity_kdf.expand(b"session.integrity_kdf.mk_next", &mut mk_next);
        integrity_kdf.expand(
            "session.integrity_kdf.integrity_key".as_bytes(),
            &mut integrity_key,
        );
        integrity_kdf.expand(
            "session.integrity_kdf.seeker_next".as_bytes(),
            &mut seeker_next,
        );
        Self {
            mk_next,
            integrity_key,
            seeker_next,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto_rng as rng;

    #[test]
    fn test_message_integrity_kdf_deterministic() {
        let integrity_seed = [5u8; 32];
        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk_next) = kem::generate_key_pair(pk_rand);
        let payload = b"test payload";

        let kdf1 = MessageIntegrityKdf::new(&integrity_seed, &pk_next, payload);
        let kdf2 = MessageIntegrityKdf::new(&integrity_seed, &pk_next, payload);

        assert_eq!(kdf1.mk_next, kdf2.mk_next);
        assert_eq!(kdf1.integrity_key, kdf2.integrity_key);
        assert_eq!(kdf1.seeker_next, kdf2.seeker_next);
    }

    #[test]
    fn test_message_integrity_kdf_different_payload() {
        let integrity_seed = [5u8; 32];
        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk_next) = kem::generate_key_pair(pk_rand);

        let kdf1 = MessageIntegrityKdf::new(&integrity_seed, &pk_next, b"payload1");
        let kdf2 = MessageIntegrityKdf::new(&integrity_seed, &pk_next, b"payload2");

        // Different payloads should produce different integrity keys
        assert_ne!(kdf1.integrity_key, kdf2.integrity_key);
    }
}
