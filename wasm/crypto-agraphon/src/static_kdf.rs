//! Key derivation from static public keys.
//!
//! This module derives initial key material from a party's static (long-term) public key.
//! These derived values are used as the starting point for the ratcheting protocol.

use crypto_kdf as kdf;
use crypto_kem as kem;

/// Key derivation function for static public keys.
///
/// Derives the initial master key (`mk_next`) and seeker seed (`seeker_next`) from
/// a static public key. These values are used to initialize the message history
/// for a party in the protocol.
///
/// # Cryptographic Details
///
/// Uses HKDF with:
/// - Salt: `"session.static_kem.salt---------"`
/// - Input: The static public key bytes
/// - Info strings: `"session.static_kem.mk_next"` and `"session.static_kem.seeker_next"`
pub struct StaticKdf {
    /// Initial master key derived from the static public key
    pub(crate) mk_next: [u8; 32],
    /// Initial seeker seed derived from the static public key
    pub(crate) seeker_next: [u8; 32],
}

impl StaticKdf {
    /// Derives initial key material from a static public key.
    ///
    /// # Arguments
    ///
    /// * `static_pk` - The static (long-term) public key
    ///
    /// # Returns
    ///
    /// A `StaticKdf` containing the derived `mk_next` and `seeker_next` values.
    ///
    /// # Example Usage (internal)
    ///
    /// ```text
    /// let mut randomness = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut randomness);
    /// let (sk, pk) = kem::generate_key_pair(randomness);
    ///
    /// let kdf = StaticKdf::new(&pk);
    /// // kdf.mk_next and kdf.seeker_next are now available
    /// ```
    pub fn new(static_pk: &kem::PublicKey) -> Self {
        let mut mk_next = [0u8; 32];
        let mut seeker_next = [0u8; 32];
        let mut static_kdf = kdf::Extract::new("session.static_kem.salt---------".as_bytes());
        static_kdf.input_item(static_pk.as_bytes());
        let static_kdf = static_kdf.finalize();
        static_kdf.expand("session.static_kem.mk_next".as_bytes(), &mut mk_next);
        static_kdf.expand(
            "session.static_kem.seeker_next".as_bytes(),
            &mut seeker_next,
        );
        Self {
            mk_next,
            seeker_next,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto_rng as rng;

    #[test]
    fn test_static_kdf_deterministic() {
        // Same public key should produce same KDF output
        let mut randomness = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut randomness);
        let (_, pk) = kem::generate_key_pair(randomness);

        let kdf1 = StaticKdf::new(&pk);
        let kdf2 = StaticKdf::new(&pk);

        assert_eq!(kdf1.mk_next, kdf2.mk_next);
        assert_eq!(kdf1.seeker_next, kdf2.seeker_next);
    }

    #[test]
    fn test_static_kdf_different_keys() {
        // Different public keys should produce different outputs
        let mut rand1 = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut rand1);
        let (_, pk1) = kem::generate_key_pair(rand1);

        let mut rand2 = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut rand2);
        let (_, pk2) = kem::generate_key_pair(rand2);

        let kdf1 = StaticKdf::new(&pk1);
        let kdf2 = StaticKdf::new(&pk2);

        assert_ne!(kdf1.mk_next, kdf2.mk_next);
        assert_ne!(kdf1.seeker_next, kdf2.seeker_next);
    }
}
