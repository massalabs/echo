//! Seeker derivation for message identification.
//!
//! This module derives "seeker" values that are used to identify which message
//! a party is responding to. Seekers enable efficient message matching in
//! asynchronous communication where messages may arrive out of order.

use crypto_kdf as kdf;

/// Key derivation function for message seekers.
///
/// A seeker is a value derived from both parties' seeker seeds that can be used
/// to efficiently identify which of our sent messages the peer is responding to.
/// This enables out-of-order message delivery.
///
/// # Protocol Context
///
/// When receiving a message, we compute seekers for all our sent messages that
/// haven't been acknowledged yet. The matching seeker tells us which message
/// the peer is responding to, allowing us to use the correct keys for decryption.
///
/// # Cryptographic Details
///
/// Uses HKDF with:
/// - Salt: `"session.seeker_kdf.salt---------"`
/// - Inputs: Both parties' seeker_next values
/// - Info string: `"session.seeker_kem.mk_next"`
pub struct SeekerKdf {
    /// The derived seeker value used for message identification
    pub(crate) seeker: [u8; 32],
}

impl SeekerKdf {
    /// Derives a seeker from both parties' seeker seeds.
    ///
    /// # Arguments
    ///
    /// * `p_self_seeker_next` - Our seeker seed from the parent message
    /// * `p_peer_seeker_next` - The peer's seeker seed from their latest message
    ///
    /// # Returns
    ///
    /// A `SeekerKdf` containing the derived seeker value.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// // Internal module, not directly accessible from public API
    /// let self_seed = [1u8; 32];
    /// let peer_seed = [2u8; 32];
    ///
    /// let kdf = SeekerKdf::new(&self_seed, &peer_seed);
    /// // kdf.seeker can now be used to identify this message pairing
    /// ```
    pub fn new(p_self_seeker_next: &[u8], p_peer_seeker_next: &[u8]) -> Self {
        let mut seeker = [0u8; 32];
        let initial_salt = "session.seeker_kdf.salt---------".as_bytes();
        let mut seeker_kdf = kdf::Extract::new(initial_salt);
        seeker_kdf.input_item(p_self_seeker_next);
        seeker_kdf.input_item(p_peer_seeker_next);
        let seeker_kdf = seeker_kdf.finalize();
        seeker_kdf.expand("session.seeker_kem.mk_next".as_bytes(), &mut seeker);
        Self { seeker }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seeker_kdf_deterministic() {
        let self_seed = [1u8; 32];
        let peer_seed = [2u8; 32];

        let kdf1 = SeekerKdf::new(&self_seed, &peer_seed);
        let kdf2 = SeekerKdf::new(&self_seed, &peer_seed);

        assert_eq!(kdf1.seeker, kdf2.seeker);
    }

    #[test]
    fn test_seeker_kdf_commutative() {
        // Seeker should be the same regardless of which party computes it
        let alice_seed = [1u8; 32];
        let bob_seed = [2u8; 32];

        let alice_kdf = SeekerKdf::new(&alice_seed, &bob_seed);
        let bob_kdf = SeekerKdf::new(&bob_seed, &alice_seed);

        // They should be different since the order matters for key derivation
        // This is intentional - the seeker depends on whose message we're responding to
        assert_ne!(alice_kdf.seeker, bob_kdf.seeker);
    }
}
