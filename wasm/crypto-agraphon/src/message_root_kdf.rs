//! Root key derivation for message encryption.
//!
//! This module derives the cryptographic material needed for message encryption
//! and authentication. It combines both parties' master keys with the ephemeral
//! shared secret from key encapsulation.

use crate::types::Role;
use crypto_cipher as cipher;
use crypto_kdf as kdf;
use crypto_kem as kem;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Root key derivation function for regular messages.
///
/// This KDF combines multiple sources of entropy to derive per-message keys:
/// - Both parties' master keys (from previous messages)
/// - A fresh shared secret from KEM encapsulation
/// - The KEM ciphertext (for domain separation)
/// - The sender's role (for bidirectional security)
///
/// # Protocol Context
///
/// Each message triggers a "ratchet step" that:
/// 1. Generates a new ephemeral KEM key pair
/// 2. Encapsulates to the peer's public key, getting a shared secret
/// 3. Combines this with both parties' current master keys
/// 4. Derives new cipher keys and an integrity seed
///
/// This ensures forward secrecy (old messages can't be decrypted if current
/// keys are compromised) and post-compromise security (new ephemeral keys
/// restore security after a compromise).
///
/// # Cryptographic Details
///
/// Uses HKDF with:
/// - Salt: `"session.message_root_kdf.salt---"`
/// - Inputs: `p_self_mk_next`, `p_peer_mk_next`, `shared_secret`, ciphertext, role
/// - Info strings: `"session.message_root_kdf.cipher_key"`,
///   `"session.message_root_kdf.cipher_nonce"`, and
///   `"session.message_root_kdf.integrity_seed"`
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct MessageRootKdf {
    /// Cipher key for encrypting the message payload
    pub(crate) cipher_key: cipher::Key,
    /// Nonce for the cipher (derived, not random)
    pub(crate) cipher_nonce: cipher::Nonce,
    /// Seed for deriving the integrity key and next master key
    pub(crate) integrity_seed: [u8; 32],
}

impl MessageRootKdf {
    /// Derives message encryption keys from ratchet state and KEM output.
    ///
    /// # Arguments
    ///
    /// * `p_self_mk_next` - Our master key from our most recent message
    /// * `p_peer_mk_next` - Peer's master key from their most recent message
    /// * `ss` - Shared secret from KEM encapsulation
    /// * `ct` - KEM ciphertext (for domain separation)
    /// * `role` - The sender's role (Initiator or Responder)
    ///
    /// # Returns
    ///
    /// A `MessageRootKdf` containing cipher keys and integrity seed.
    ///
    /// # Example Usage (internal)
    ///
    /// ```text
    /// let self_mk = [1u8; 32];
    /// let peer_mk = [2u8; 32];
    ///
    /// // Generate KEM keypair and encapsulate
    /// let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut pk_rand);
    /// let (_, pk) = kem::generate_key_pair(pk_rand);
    ///
    /// let mut enc_rand = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut enc_rand);
    /// let (ct, ss) = kem::encapsulate(&pk, enc_rand);
    ///
    /// let kdf = MessageRootKdf::new(&self_mk, &peer_mk, &ss, &ct, &Role::Initiator);
    /// // kdf.cipher_key and kdf.cipher_nonce can now be used to encrypt the message
    /// ```
    pub(crate) fn new(
        p_self_mk_next: &[u8],
        p_peer_mk_next: &[u8],
        ss: &kem::SharedSecret,
        ct: &kem::Ciphertext,
        role: &Role,
    ) -> Self {
        let mut cipher_key = [0u8; cipher::KEY_SIZE];
        let mut cipher_nonce = [0u8; cipher::NONCE_SIZE];
        let mut integrity_seed = [0u8; 32];

        let mut root_kdf = kdf::Extract::new(b"session.message_root_kdf.salt---");
        root_kdf.input_item(p_self_mk_next);
        root_kdf.input_item(p_peer_mk_next);
        root_kdf.input_item(ss.as_bytes());
        root_kdf.input_item(ct.as_bytes());
        root_kdf.input_item(role.as_bytes());
        let root_kdf = root_kdf.finalize();
        root_kdf.expand(
            "session.message_root_kdf.cipher_key".as_bytes(),
            &mut cipher_key,
        );
        root_kdf.expand(
            "session.message_root_kdf.cipher_nonce".as_bytes(),
            &mut cipher_nonce,
        );
        root_kdf.expand(
            "session.message_root_kdf.integrity_seed".as_bytes(),
            &mut integrity_seed,
        );

        Self {
            cipher_key: cipher_key.into(),
            cipher_nonce: cipher_nonce.into(),
            integrity_seed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto_rng as rng;

    #[test]
    fn test_message_root_kdf_deterministic() {
        let self_mk = [1u8; 32];
        let peer_mk = [2u8; 32];

        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk) = kem::generate_key_pair(pk_rand);

        let mut enc_rand = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand);
        let (ct, ss) = kem::encapsulate(&pk, enc_rand);

        let kdf1 = MessageRootKdf::new(&self_mk, &peer_mk, &ss, &ct, &Role::Initiator);
        let kdf2 = MessageRootKdf::new(&self_mk, &peer_mk, &ss, &ct, &Role::Initiator);

        assert_eq!(kdf1.cipher_key.as_bytes(), kdf2.cipher_key.as_bytes());
        assert_eq!(kdf1.cipher_nonce.as_bytes(), kdf2.cipher_nonce.as_bytes());
        assert_eq!(kdf1.integrity_seed, kdf2.integrity_seed);
    }

    #[test]
    fn test_message_root_kdf_different_roles() {
        let self_mk = [1u8; 32];
        let peer_mk = [2u8; 32];

        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk) = kem::generate_key_pair(pk_rand);

        let mut enc_rand = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand);
        let (ct, ss) = kem::encapsulate(&pk, enc_rand);

        let kdf_initiator = MessageRootKdf::new(&self_mk, &peer_mk, &ss, &ct, &Role::Initiator);
        let kdf_responder = MessageRootKdf::new(&self_mk, &peer_mk, &ss, &ct, &Role::Responder);

        // Different roles should produce different keys
        assert_ne!(
            kdf_initiator.cipher_key.as_bytes(),
            kdf_responder.cipher_key.as_bytes()
        );
    }
}
