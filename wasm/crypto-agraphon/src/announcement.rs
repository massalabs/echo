//! Session announcement and handshake protocol.
//!
//! This module implements the initial handshake for establishing a secure session.
//! The announcement phase allows two parties to exchange keys and optionally
//! perform authentication before beginning encrypted communication.

use crate::announcement_auth_kdf::AnnouncementAuthKdf;
use crate::announcement_root_kdf::AnnouncementRootKdf;
use crypto_aead as cipher;
use crypto_kem as kem;
use crypto_rng as rng;
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

/// Intermediate state when receiving an announcement.
///
/// After receiving and decrypting an announcement, this precursor allows the
/// application to inspect the authentication payload and verify the message
/// integrity before finalizing the session.
///
/// # Protocol Flow
///
/// 1. Receiver calls `try_from_incoming_announcement_bytes()` with the received bytes
/// 2. Receiver inspects `auth_payload()` for authentication data
/// 3. After verification, receiver calls `finalize()` to complete the handshake
///
/// # Security Note
///
/// The `auth_key` ensures that the authentication is bound to this specific announcement,
/// preventing replay attacks where an attacker might intercept a previous authentication
/// payload and repackage it in a new announcement.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct IncomingAnnouncementPrecursor {
    pk_next: kem::PublicKey,
    auth_payload: Vec<u8>,
    seeker_next: [u8; 32],
    k_next: [u8; 32],
    auth_key: [u8; 32],
    id: [u8; 32],
}

impl IncomingAnnouncementPrecursor {
    /// Attempts to decrypt and parse an incoming announcement.
    ///
    /// This is the first step in receiving a session announcement. It decrypts
    /// the announcement using our static key pair and extracts the authentication
    /// payload and key.
    ///
    /// # Arguments
    ///
    /// * `announcement_bytes` - The raw announcement bytes received from the initiator
    /// * `our_pk` - Our static public key
    /// * `our_sk` - Our static secret key
    ///
    /// # Returns
    ///
    /// `Some(IncomingAnnouncementPrecursor)` if decryption succeeds, `None` if the
    /// announcement is malformed or cannot be decrypted.
    ///
    /// # Format
    ///
    /// Announcement bytes contain:
    /// - 32 bytes: randomness
    /// - `kem::CIPHERTEXT_SIZE` bytes: KEM ciphertext
    /// - Remaining bytes: encrypted (`auth_payload` || `integrity_key`)
    ///
    /// # Examples
    ///
    /// ```
    /// use crypto_agraphon::{OutgoingAnnouncementPrecursor, IncomingAnnouncementPrecursor};
    /// use crypto_kem as kem;
    /// use crypto_rng as rng;
    ///
    /// // Bob generates his key pair
    /// let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut bob_rand);
    /// let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);
    ///
    /// // Alice sends an announcement to Bob
    /// let announcement_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
    /// let auth_payload = b"Alice's identity info";
    /// let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut alice_rand);
    /// let (_, alice_pk) = kem::generate_key_pair(alice_rand);
    /// let (announcement_bytes, announcement) = announcement_pre.finalize(auth_payload);
    ///
    /// // Bob receives and decrypts it
    /// let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
    ///     &announcement_bytes,
    ///     &bob_pk,
    ///     &bob_sk,
    /// ).expect("Failed to decrypt announcement");
    ///
    /// assert_eq!(incoming_pre.auth_payload(), auth_payload);
    /// ```
    #[must_use]
    #[allow(clippy::similar_names)] // pk/sk naming is standard in cryptography
    pub fn try_from_incoming_announcement_bytes(
        announcement_bytes: &[u8],
        our_pk: &kem::PublicKey,
        our_sk: &kem::SecretKey,
    ) -> Option<Self> {
        let randomness: [u8; 32] = announcement_bytes.get(..32)?.try_into().ok()?;

        let ct_end_index = 32 + kem::CIPHERTEXT_SIZE;
        let ct_bytes: [u8; kem::CIPHERTEXT_SIZE] =
            announcement_bytes.get(32..ct_end_index)?.try_into().ok()?;
        let ct = kem::Ciphertext::from(ct_bytes);

        let encrypted_message = announcement_bytes.get(ct_end_index..)?;

        let ss = kem::decapsulate(our_sk, &ct);

        let root_kdf = AnnouncementRootKdf::new(&randomness, &ss, &ct, our_pk);

        let plaintext = Zeroizing::new(cipher::decrypt(
            &root_kdf.cipher_key,
            &root_kdf.cipher_nonce,
            encrypted_message,
            b"",
        )?);

        // Extract pk_next from plaintext
        let pk_next_bytes: [u8; kem::PUBLIC_KEY_SIZE] =
            plaintext.get(..kem::PUBLIC_KEY_SIZE)?.try_into().ok()?;
        let pk_next = kem::PublicKey::from(pk_next_bytes);

        // Extract auth payload (remaining part of plaintext)
        let auth_payload = plaintext.get(kem::PUBLIC_KEY_SIZE..)?.to_vec();

        // Generate auth key using AnnouncementAuthKdf
        let auth_kdf = AnnouncementAuthKdf::new(&root_kdf.auth_pre_key, &pk_next);

        Some(Self {
            pk_next,
            seeker_next: root_kdf.seeker_next,
            k_next: root_kdf.k_next,
            auth_payload,
            auth_key: auth_kdf.auth_key,
            id: root_kdf.id,
        })
    }

    /// Returns the authentication payload from the announcement.
    ///
    /// This payload can contain arbitrary data from the initiator, such as
    /// identity information, a greeting, or application-specific data.
    ///
    /// # Examples
    ///
    /// ```
    /// # use crypto_agraphon::{OutgoingAnnouncementPrecursor, IncomingAnnouncementPrecursor};
    /// # use crypto_kem as kem;
    /// # use crypto_rng as rng;
    /// # let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut bob_rand);
    /// # let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);
    /// # let announcement_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
    /// # let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut alice_rand);
    /// # let (_, alice_pk) = kem::generate_key_pair(alice_rand);
    /// # let (announcement_bytes, announcement) = announcement_pre.finalize(b"Hello from Alice");
    /// # let incoming = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
    /// #     &announcement_bytes, &bob_pk, &bob_sk
    /// # ).unwrap();
    /// let payload = incoming.auth_payload();
    /// println!("Received: {}", String::from_utf8_lossy(payload));
    /// ```
    #[must_use]
    pub fn auth_payload(&self) -> &[u8] {
        &self.auth_payload
    }

    /// Returns the authentication key for message binding verification.
    ///
    /// Both parties derive the same `auth_key` from the announcement. This key
    /// cryptographically binds the authentication payload to this specific
    /// announcement message.
    ///
    /// # Security Note
    ///
    /// The `auth_key` prevents replay attacks where an attacker might intercept a previous
    /// authentication payload and attempt to reuse it in a new announcement.
    ///
    /// # Examples
    ///
    /// ```
    /// # use crypto_agraphon::{OutgoingAnnouncementPrecursor, IncomingAnnouncementPrecursor};
    /// # use crypto_kem as kem;
    /// # use crypto_rng as rng;
    /// # let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut bob_rand);
    /// # let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);
    /// # let announcement_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
    /// # let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut alice_rand);
    /// # let (_, alice_pk) = kem::generate_key_pair(alice_rand);
    /// # let outgoing_auth_key = announcement_pre.auth_key();
    /// # let (announcement_bytes, announcement) = announcement_pre.finalize(b"Hello");
    /// # let incoming = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
    /// #     &announcement_bytes, &bob_pk, &bob_sk
    /// # ).unwrap();
    /// let auth_key = incoming.auth_key();
    /// // Display for user verification (e.g., as hex, QR code, etc.)
    /// println!("Verify this key matches the initiator's: {:?}", &auth_key[..8]);
    /// ```
    #[must_use]
    pub const fn auth_key(&self) -> &[u8; 32] {
        &self.auth_key
    }

    /// Finalizes the announcement after authentication.
    ///
    /// After verifying the `auth_payload`, call this method with the initiator's
    /// public key to complete the handshake. This method will verify the message
    /// integrity to ensure the announcement hasn't been tampered with.
    ///
    /// # Arguments
    ///
    /// * `pk_peer` - The initiator's static public key
    ///
    /// # Returns
    ///
    /// `Some(IncomingAnnouncement)` if the integrity check passes, `None` if
    /// the integrity key doesn't match (indicating tampering or corruption).
    ///
    /// # Examples
    ///
    /// ```
    /// # use crypto_agraphon::{OutgoingAnnouncementPrecursor, IncomingAnnouncementPrecursor};
    /// # use crypto_kem as kem;
    /// # use crypto_rng as rng;
    /// # let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut bob_rand);
    /// # let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);
    /// # let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut alice_rand);
    /// # let (_, alice_pk) = kem::generate_key_pair(alice_rand);
    /// # let announcement_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
    /// # let (announcement_bytes, announcement) = announcement_pre.finalize(b"Hello");
    /// # let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
    /// #     &announcement_bytes, &bob_pk, &bob_sk
    /// # ).unwrap();
    /// // After verifying the auth_payload and auth_key...
    /// let incoming = incoming_pre.finalize(alice_pk)
    ///     .expect("Integrity check failed");
    /// ```
    #[must_use]
    pub fn finalize(self, pk_peer: kem::PublicKey) -> Option<IncomingAnnouncement> {
        Some(IncomingAnnouncement {
            pk_peer,
            pk_next: self.pk_next.clone(),
            k_next: self.k_next,
            seeker_next: self.seeker_next,
            id: self.id,
        })
    }
}

/// Finalized incoming announcement ready to create a session.
///
/// This struct contains all the information needed to create an `Agraphon`
/// session from the responder's perspective. It's obtained by calling
/// `IncomingAnnouncementPrecursor::finalize()`.
///
/// Pass this to `Agraphon::try_from_incoming_announcement()` to create the session.
#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct IncomingAnnouncement {
    pub(crate) pk_peer: kem::PublicKey,
    pub(crate) pk_next: kem::PublicKey,
    pub(crate) k_next: [u8; 32],
    pub(crate) seeker_next: [u8; 32],
    pub(crate) id: [u8; 32],
}

/// Intermediate state when creating an announcement.
///
/// This precursor generates the cryptographic material needed for the announcement,
/// including the `auth_key` that binds the authentication to this specific message.
///
/// # Protocol Flow
///
/// 1. Initiator creates an `OutgoingAnnouncementPrecursor` with responder's public key
/// 2. Initiator calls `finalize()` with `auth_payload` and own public key
/// 3. Initiator sends the resulting bytes to the responder
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct OutgoingAnnouncementPrecursor {
    randomness: [u8; 32],
    kem_ct: kem::Ciphertext,
    cipher_key: cipher::Key,
    cipher_nonce: cipher::Nonce,
    auth_key: [u8; 32],
    k_next: [u8; 32],
    seeker_next: [u8; 32],
    pk_next: kem::PublicKey,
    sk_next: kem::SecretKey,
    id: [u8; 32],
}

impl OutgoingAnnouncementPrecursor {
    /// Creates a new announcement precursor to a peer.
    ///
    /// Generates fresh randomness and performs KEM encapsulation to the peer's
    /// static public key. The resulting `auth_key` can be inspected before
    /// finalizing the announcement.
    ///
    /// # Arguments
    ///
    /// * `pk_peer` - The responder's static public key
    ///
    /// # Returns
    ///
    /// An `OutgoingAnnouncementPrecursor` ready to be finalized.
    ///
    /// # Examples
    ///
    /// ```
    /// use crypto_agraphon::OutgoingAnnouncementPrecursor;
    /// use crypto_kem as kem;
    /// use crypto_rng as rng;
    ///
    /// // Bob's public key
    /// let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut bob_rand);
    /// let (_, bob_pk) = kem::generate_key_pair(bob_rand);
    ///
    /// // Alice creates announcement to Bob
    /// let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
    /// // precursor.auth_key() can now be displayed for verification
    /// ```
    #[must_use]
    pub fn new(pk_peer: &kem::PublicKey) -> Self {
        // announcement root KDF randomness
        let mut randomness = Zeroizing::new([0u8; 32]);
        rng::fill_buffer(randomness.as_mut());

        // peer KEM encapsulation
        let (kem_ct, kem_ss) = {
            let mut kem_randomness = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
            rng::fill_buffer(&mut kem_randomness);
            kem::encapsulate(pk_peer, kem_randomness)
        };

        // announcement root KDF
        let root_kdf = AnnouncementRootKdf::new(&randomness, &kem_ss, &kem_ct, pk_peer);

        // sk_next/pk_next KEM keypair generation
        let (sk_next, pk_next) = {
            let mut kem_randomness = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
            rng::fill_buffer(&mut kem_randomness);
            kem::generate_key_pair(kem_randomness)
        };

        // announcement auth KDF
        let announcement_auth_kdf = AnnouncementAuthKdf::new(&root_kdf.auth_pre_key, &pk_next);

        // Create new Nonce and Key objects using the raw bytes from root_kdf
        let cipher_nonce = cipher::Nonce::from(*root_kdf.cipher_nonce.as_bytes());
        let cipher_key = cipher::Key::from(*root_kdf.cipher_key.as_bytes());

        Self {
            randomness: *randomness,
            kem_ct,
            k_next: root_kdf.k_next,
            pk_next,
            sk_next,
            cipher_nonce,
            cipher_key,
            auth_key: announcement_auth_kdf.auth_key,
            seeker_next: root_kdf.seeker_next,
            id: root_kdf.id,
        }
    }

    /// Returns the authentication key for message binding.
    ///
    /// This key cryptographically binds the authentication payload to this specific
    /// announcement, preventing replay attacks where an attacker might intercept a
    /// previous authentication and attempt to reuse it.
    ///
    /// # Examples
    ///
    /// ```
    /// # use crypto_agraphon::OutgoingAnnouncementPrecursor;
    /// # use crypto_kem as kem;
    /// # use crypto_rng as rng;
    /// # let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut bob_rand);
    /// # let (_, bob_pk) = kem::generate_key_pair(bob_rand);
    /// let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
    /// let auth_key = precursor.auth_key();
    /// // Display for user verification (e.g., as hex, QR code, etc.)
    /// println!("Verify this key with responder: {:?}", &auth_key[..8]);
    /// ```
    #[must_use]
    pub const fn auth_key(&self) -> &[u8; 32] {
        &self.auth_key
    }

    /// Finalizes the announcement with an auth payload.
    ///
    /// Call this method with your `auth_payload` (e.g., identity information) and your
    /// static public key to create the final announcement bytes. The authentication
    /// is cryptographically bound to this specific announcement to prevent replay attacks.
    ///
    /// # Arguments
    ///
    /// * `auth_payload` - Arbitrary data to include in the announcement
    /// * `pk_self` - Your static public key
    ///
    /// # Returns
    ///
    /// An `OutgoingAnnouncement` with bytes ready to send to the responder.
    ///
    /// # Examples
    ///
    /// ```
    /// use crypto_agraphon::OutgoingAnnouncementPrecursor;
    /// use crypto_kem as kem;
    /// use crypto_rng as rng;
    ///
    /// // Generate both parties' keys
    /// let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut alice_rand);
    /// let (_, alice_pk) = kem::generate_key_pair(alice_rand);
    ///
    /// let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut bob_rand);
    /// let (_, bob_pk) = kem::generate_key_pair(bob_rand);
    ///
    /// // Alice creates and finalizes announcement
    /// let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
    /// let (announcement_bytes, announcement) = precursor.finalize(b"Hello from Alice!");
    ///
    /// // Send announcement_bytes to Bob
    /// ```
    #[must_use]
    pub fn finalize(self, auth_payload: &[u8]) -> (Vec<u8>, OutgoingAnnouncement) {
        // gather plaintext
        let plaintext = Zeroizing::new([self.pk_next.as_bytes(), auth_payload].concat());

        // encrypt
        let ciphertext = Zeroizing::new(cipher::encrypt(
            &self.cipher_key,
            &self.cipher_nonce,
            &plaintext,
            b"",
        ));

        // build full message
        let announcement_bytes = [
            self.randomness.as_slice(),
            self.kem_ct.as_bytes(),
            &ciphertext,
        ]
        .concat();

        let announcement = OutgoingAnnouncement {
            k_next: self.k_next,
            sk_next: self.sk_next.clone(),
            seeker_next: self.seeker_next,
            id: self.id,
        };

        (announcement_bytes, announcement)
    }
}

/// Finalized outgoing announcement ready to send.
///
/// This struct contains the keys needed to create an `Agraphon` session after
/// the responder acknowledges receipt.
///
/// Pass this to `Agraphon::from_outgoing_announcement()` to create the session.
#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct OutgoingAnnouncement {
    pub(crate) k_next: [u8; 32],
    pub(crate) sk_next: kem::SecretKey,
    pub(crate) seeker_next: [u8; 32],
    pub(crate) id: [u8; 32],
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto_rng as rng;

    #[test]
    fn test_announcement_roundtrip() {
        // Alice creates announcement to Bob
        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (_alice_sk, alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        // Alice creates outgoing announcement
        let alice_precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let alice_auth_key = *alice_precursor.auth_key();
        let auth_payload = b"Alice's authentication data";
        let (announcement_bytes, alice_announcement) = alice_precursor.finalize(auth_payload);

        // Bob receives announcement
        let bob_precursor = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            &announcement_bytes,
            &bob_pk,
            &bob_sk,
        )
        .expect("Failed to parse announcement");

        // Verify auth payload
        assert_eq!(bob_precursor.auth_payload(), auth_payload);

        // Verify auth keys match
        assert_eq!(bob_precursor.auth_key(), &alice_auth_key);

        // Bob finalizes
        let bob_announcement = bob_precursor
            .finalize(alice_pk)
            .expect("Integrity check failed");

        // Verify session keys match
        assert_eq!(alice_announcement.k_next, bob_announcement.k_next);
        assert_eq!(alice_announcement.seeker_next, bob_announcement.seeker_next);
    }

    #[test]
    fn test_announcement_wrong_key_fails() {
        // Generate keys
        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (_, _alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (_bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        let mut eve_rand = [1u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut eve_rand);
        let (eve_sk, _) = kem::generate_key_pair(eve_rand);

        // Alice creates announcement to Bob
        let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let (announcement_bytes, _) = precursor.finalize(b"test");

        // Eve tries to decrypt with wrong key - should fail
        let result = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            &announcement_bytes,
            &bob_pk,
            &eve_sk,
        );

        assert!(result.is_none());
    }

    #[test]
    fn test_announcement_corrupted_bytes() {
        // Generate keys
        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        // Create announcement
        let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let (mut announcement_bytes, _) = precursor.finalize(b"test");

        // Corrupt the bytes
        if announcement_bytes.len() > 100 {
            announcement_bytes[100] ^= 1;
        }

        // Decryption should fail
        let result = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            &announcement_bytes,
            &bob_pk,
            &bob_sk,
        );

        assert!(result.is_none());
    }

    #[test]
    fn test_announcement_empty_auth_payload() {
        // Test with empty auth payload
        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (_, _alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let (announcement_bytes, _) = precursor.finalize(b"");

        let bob_precursor = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            &announcement_bytes,
            &bob_pk,
            &bob_sk,
        )
        .expect("Failed to parse announcement");

        assert_eq!(bob_precursor.auth_payload(), b"");
    }

    #[test]
    fn test_announcement_large_auth_payload() {
        // Test with large auth payload
        let large_payload = vec![42u8; 10000];

        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (_, _alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let (announcement_bytes, _) = precursor.finalize(&large_payload);

        let bob_precursor = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            &announcement_bytes,
            &bob_pk,
            &bob_sk,
        )
        .expect("Failed to parse announcement");

        assert_eq!(bob_precursor.auth_payload(), large_payload.as_slice());
    }

    #[test]
    fn test_announcement_auth_key_deterministic() {
        // Same announcement should produce same auth key
        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let auth_key1 = *precursor.auth_key();
        let (announcement_bytes, _) = precursor.finalize(b"test");

        let bob_precursor = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            &announcement_bytes,
            &bob_pk,
            &bob_sk,
        )
        .expect("Failed to parse announcement");
        let auth_key2 = *bob_precursor.auth_key();

        assert_eq!(auth_key1, auth_key2);
    }
}
