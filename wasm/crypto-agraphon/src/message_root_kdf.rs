//! Root key derivation for message encryption.
//!
//! This module derives the cryptographic material needed for message encryption
//! and authentication. It combines both parties' master keys with the ephemeral
//! shared secret from key encapsulation.

use crypto_aead as cipher;
use crypto_kdf as kdf;
use crypto_kem as kem;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Root key derivation function for regular messages.
///
/// This KDF combines multiple sources of entropy to derive per-message keys:
/// - Fresh randomness
/// - Both parties' master keys (from previous messages)
/// - A fresh shared secret from KEM encapsulation
/// - The KEM ciphertext (for domain separation)
/// - The sender's role (for bidirectional security)
///
/// # Protocol Context
///
/// Each message triggers a "ratchet step" that:
/// 1. Generates fresh 32-byte randomness
/// 2. Generates a new ephemeral KEM key pair
/// 3. Encapsulates to the peer's public key, getting a shared secret
/// 4. Combines randomness, both parties' current master keys, and the shared secret
/// 5. Derives new cipher keys and an integrity seed
///
/// This ensures forward secrecy (old messages can't be decrypted if current
/// keys are compromised) and post-compromise security (new ephemeral keys
/// restore security after a compromise).
///
/// # Cryptographic Details
///
/// Uses HKDF with:
/// - Salt: `"agraphon.message_root_kdf.salt.V1----"`
/// - Inputs: `randomness`, `p_self_mk_next`, `p_peer_mk_next`, `shared_secret`, ciphertext, role
/// - Info strings: `"agraphon.message_root_kdf.cipher_key"`
///   `"agraphon.message_root_kdf.cipher_nonce"`, and
///   `"agraphon.message_root_kdf.integrity_seed"`
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct MessageRootKdf {
    /// Cipher key for encrypting the message payload
    pub(crate) cipher_key: cipher::Key,
    /// Nonce for the cipher (derived, not random)
    pub(crate) cipher_nonce: cipher::Nonce,
    /// Key for next message KDF
    pub(crate) k_next: [u8; 32],
    /// Seeker key for next message
    pub(crate) seeker_next: [u8; 32],
}

impl MessageRootKdf {
    /// Derives message encryption keys from ratchet state and KEM output.
    ///
    /// # Arguments
    ///
    /// * `randomness` - Fresh 32-byte randomness for this message
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
    /// // Generate fresh randomness
    /// let mut randomness = [0u8; 32];
    /// rng::fill_buffer(&mut randomness);
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
    /// let kdf = MessageRootKdf::new(&randomness, &self_mk, &peer_mk, &ss, &ct, &Role::Initiator);
    /// // kdf.cipher_key and kdf.cipher_nonce can now be used to encrypt the message
    /// ```
    pub(crate) fn new(
        randomness: &[u8; 32],
        p_self_k_next: &[u8],
        p_peer_k_next: &[u8],
        ct: &kem::Ciphertext,
        ss: &kem::SharedSecret,
        ct_static: &kem::Ciphertext,
        ss_static: &kem::SharedSecret,
    ) -> Self {
        let mut cipher_key = [0u8; cipher::KEY_SIZE];
        let mut cipher_nonce = [0u8; cipher::NONCE_SIZE];
        let mut k_next = [0u8; 32];
        let mut seeker_next = [0u8; 32];
        let mut id = [0u8; 32];

        let mut root_kdf = kdf::Extract::new(b"agraphon.message_root_kdf.salt.V1");
        root_kdf.input_item(randomness.as_slice());
        root_kdf.input_item(p_self_k_next);
        root_kdf.input_item(p_peer_k_next);
        root_kdf.input_item(ct.as_bytes());
        root_kdf.input_item(ss.as_bytes());
        root_kdf.input_item(ct_static.as_bytes());
        root_kdf.input_item(ss_static.as_bytes());
        root_kdf.input_item(id.as_slice());
        let root_kdf = root_kdf.finalize();
        root_kdf.expand(
            "agraphon.message_root_kdf.cipher_nonce".as_bytes(),
            &mut cipher_nonce,
        );
        root_kdf.expand(
            "agraphon.message_root_kdf.cipher_key".as_bytes(),
            &mut cipher_key,
        );
        root_kdf.expand("agraphon.message_root_kdf.k_next".as_bytes(), &mut k_next);
        root_kdf.expand(
            "agraphon.message_root_kdf.seeker_next".as_bytes(),
            &mut seeker_next,
        );
        root_kdf.expand("agraphon.message_root_kdf.id".as_bytes(), &mut id);
        Self {
            cipher_nonce: cipher_nonce.into(),
            cipher_key: cipher_key.into(),
            k_next,
            seeker_next,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto_rng as rng;

    #[test]
    fn test_message_root_kdf_deterministic() {
        // Same inputs should produce same outputs
        let randomness = [42u8; 32];
        let p_self_k_next = [1u8; 32];
        let p_peer_k_next = [2u8; 32];

        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk) = kem::generate_key_pair(pk_rand);

        let mut enc_rand = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand);
        let (ct, ss) = kem::encapsulate(&pk, enc_rand);

        let mut enc_rand2 = [1u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand2);
        let (ct_static, ss_static) = kem::encapsulate(&pk, enc_rand2);

        let kdf1 = MessageRootKdf::new(
            &randomness,
            &p_self_k_next,
            &p_peer_k_next,
            &ct,
            &ss,
            &ct_static,
            &ss_static,
        );
        let kdf2 = MessageRootKdf::new(
            &randomness,
            &p_self_k_next,
            &p_peer_k_next,
            &ct,
            &ss,
            &ct_static,
            &ss_static,
        );

        assert_eq!(kdf1.cipher_key.as_bytes(), kdf2.cipher_key.as_bytes());
        assert_eq!(kdf1.cipher_nonce.as_bytes(), kdf2.cipher_nonce.as_bytes());
        assert_eq!(kdf1.k_next, kdf2.k_next);
        assert_eq!(kdf1.seeker_next, kdf2.seeker_next);
    }

    #[test]
    fn test_message_root_kdf_different_randomness() {
        // Different randomness should produce different outputs
        let randomness1 = [1u8; 32];
        let randomness2 = [2u8; 32];
        let p_self_k_next = [1u8; 32];
        let p_peer_k_next = [2u8; 32];

        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk) = kem::generate_key_pair(pk_rand);

        let mut enc_rand = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand);
        let (ct, ss) = kem::encapsulate(&pk, enc_rand);

        let mut enc_rand2 = [1u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand2);
        let (ct_static, ss_static) = kem::encapsulate(&pk, enc_rand2);

        let kdf1 = MessageRootKdf::new(
            &randomness1,
            &p_self_k_next,
            &p_peer_k_next,
            &ct,
            &ss,
            &ct_static,
            &ss_static,
        );
        let kdf2 = MessageRootKdf::new(
            &randomness2,
            &p_self_k_next,
            &p_peer_k_next,
            &ct,
            &ss,
            &ct_static,
            &ss_static,
        );

        assert_ne!(kdf1.cipher_key.as_bytes(), kdf2.cipher_key.as_bytes());
        assert_ne!(kdf1.k_next, kdf2.k_next);
    }

    #[test]
    fn test_message_root_kdf_different_k_next() {
        // Different k_next values should produce different outputs
        let randomness = [42u8; 32];
        let p_self_k_next1 = [1u8; 32];
        let p_self_k_next2 = [2u8; 32];
        let p_peer_k_next = [3u8; 32];

        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk) = kem::generate_key_pair(pk_rand);

        let mut enc_rand = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand);
        let (ct, ss) = kem::encapsulate(&pk, enc_rand);

        let mut enc_rand2 = [1u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand2);
        let (ct_static, ss_static) = kem::encapsulate(&pk, enc_rand2);

        let kdf1 = MessageRootKdf::new(
            &randomness,
            &p_self_k_next1,
            &p_peer_k_next,
            &ct,
            &ss,
            &ct_static,
            &ss_static,
        );
        let kdf2 = MessageRootKdf::new(
            &randomness,
            &p_self_k_next2,
            &p_peer_k_next,
            &ct,
            &ss,
            &ct_static,
            &ss_static,
        );

        assert_ne!(kdf1.cipher_key.as_bytes(), kdf2.cipher_key.as_bytes());
        assert_ne!(kdf1.k_next, kdf2.k_next);
    }

    #[test]
    fn test_message_root_kdf_output_sizes() {
        // Verify all outputs have correct sizes
        let randomness = [42u8; 32];
        let p_self_k_next = [1u8; 32];
        let p_peer_k_next = [2u8; 32];

        let mut pk_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_rand);
        let (_, pk) = kem::generate_key_pair(pk_rand);

        let mut enc_rand = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand);
        let (ct, ss) = kem::encapsulate(&pk, enc_rand);

        let mut enc_rand2 = [1u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut enc_rand2);
        let (ct_static, ss_static) = kem::encapsulate(&pk, enc_rand2);

        let kdf = MessageRootKdf::new(
            &randomness,
            &p_self_k_next,
            &p_peer_k_next,
            &ct,
            &ss,
            &ct_static,
            &ss_static,
        );

        assert_eq!(kdf.cipher_key.as_bytes().len(), cipher::KEY_SIZE);
        assert_eq!(kdf.cipher_nonce.as_bytes().len(), cipher::NONCE_SIZE);
        assert_eq!(kdf.k_next.len(), 32);
        assert_eq!(kdf.seeker_next.len(), 32);
    }
}
