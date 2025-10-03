//! Session announcement and handshake protocol.
//!
//! This module implements the initial handshake for establishing a secure session.
//! The announcement phase allows two parties to exchange keys and optionally
//! perform out-of-band authentication before beginning encrypted communication.

use crate::announcement_root_kdf::AnnouncementRootKdf;
use crate::message_integrity_kdf::MessageIntegrityKdf;
use crypto_cipher as cipher;
use crypto_kem as kem;
use crypto_rng as rng;
use subtle::ConstantTimeEq;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

/// Intermediate state when receiving an announcement.
///
/// After receiving and decrypting an announcement, this precursor allows the
/// application to inspect the authentication payload and verify it (e.g., by
/// comparing the `auth_key` with the initiator) before finalizing the session.
///
/// # Protocol Flow
///
/// 1. Receiver calls `try_from_incoming_announcement_bytes()` with the received bytes
/// 2. Receiver inspects `auth_payload()` and `auth_key()` for authentication
/// 3. After verification, receiver calls `finalize()` to complete the handshake
///
/// # Security Note
///
/// The `auth_key` should be compared with the initiator over an authenticated
/// channel (e.g., QR code scan, voice call) to prevent man-in-the-middle attacks.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct IncomingAnnouncementPrecursor {
    auth_payload: Vec<u8>,
    auth_key: [u8; 32],
    integrity_seed: [u8; 32],
    integrity_key: [u8; 32],
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
    /// let announcement = announcement_pre.finalize(auth_payload, &alice_pk);
    ///
    /// // Bob receives and decrypts it
    /// let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
    ///     announcement.announcement_bytes(),
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

        let mut plaintext = Zeroizing::new(encrypted_message.to_vec());
        cipher::decrypt(&root_kdf.cipher_key, &root_kdf.cipher_nonce, &mut plaintext);

        let payload_end_index = plaintext.len().checked_sub(32)?;
        let auth_payload = plaintext.get(..payload_end_index)?.to_vec();

        let integrity_key: [u8; 32] = plaintext.get(payload_end_index..)?.try_into().ok()?;

        Some(Self {
            auth_payload,
            auth_key: root_kdf.auth_key,
            integrity_seed: root_kdf.integrity_seed,
            integrity_key,
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
    /// # let announcement = announcement_pre.finalize(b"Hello from Alice", &alice_pk);
    /// # let incoming = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
    /// #     announcement.announcement_bytes(), &bob_pk, &bob_sk
    /// # ).unwrap();
    /// let payload = incoming.auth_payload();
    /// println!("Received: {}", String::from_utf8_lossy(payload));
    /// ```
    #[must_use]
    pub fn auth_payload(&self) -> &[u8] {
        &self.auth_payload
    }

    /// Returns the authentication key for out-of-band verification.
    ///
    /// Both parties derive the same `auth_key` from the announcement. This can be
    /// displayed (e.g., as a QR code or hex string) and compared over an
    /// authenticated channel to verify the session is not being intercepted.
    ///
    /// # Security Note
    ///
    /// The `auth_key` verification is optional but highly recommended for high-security
    /// applications to prevent man-in-the-middle attacks.
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
    /// # let announcement = announcement_pre.finalize(b"Hello", &alice_pk);
    /// # let incoming = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
    /// #     announcement.announcement_bytes(), &bob_pk, &bob_sk
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
    /// After verifying the `auth_payload` and optionally comparing `auth_keys` with
    /// the initiator, call this method with the initiator's public key to
    /// complete the handshake.
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
    /// # let announcement = announcement_pre.finalize(b"Hello", &alice_pk);
    /// # let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
    /// #     announcement.announcement_bytes(), &bob_pk, &bob_sk
    /// # ).unwrap();
    /// // After verifying the auth_payload and auth_key...
    /// let incoming = incoming_pre.finalize(alice_pk)
    ///     .expect("Integrity check failed");
    /// ```
    #[must_use]
    pub fn finalize(self, pk_peer: kem::PublicKey) -> Option<IncomingAnnouncement> {
        let integrity_kdf =
            MessageIntegrityKdf::new(&self.integrity_seed, &pk_peer, &self.auth_payload);

        // Use constant-time comparison to prevent timing attacks
        if !bool::from(self.integrity_key.ct_eq(&integrity_kdf.integrity_key)) {
            return None;
        }

        Some(IncomingAnnouncement {
            pk_peer,
            mk_next: integrity_kdf.mk_next,
            seeker_next: integrity_kdf.seeker_next,
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
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct IncomingAnnouncement {
    pub(crate) pk_peer: kem::PublicKey,
    pub(crate) mk_next: [u8; 32],
    pub(crate) seeker_next: [u8; 32],
}

/// Intermediate state when creating an announcement.
///
/// This precursor allows the application to access the `auth_key` before
/// finalizing the announcement. The `auth_key` can be displayed to the user
/// for out-of-band verification with the responder.
///
/// # Protocol Flow
///
/// 1. Initiator creates an `OutgoingAnnouncementPrecursor` with responder's public key
/// 2. Initiator displays `auth_key()` to user for verification
/// 3. Initiator calls `finalize()` with `auth_payload` and own public key
/// 4. Initiator sends the resulting bytes to the responder
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct OutgoingAnnouncementPrecursor {
    randomness: [u8; 32],
    kem_ct: kem::Ciphertext,
    root_kdf: AnnouncementRootKdf,
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
        let mut kem_randomness = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut kem_randomness);
        let (kem_ct, kem_ss) = kem::encapsulate(pk_peer, kem_randomness);

        let mut root_kdf_randomness = [0u8; 32];
        rng::fill_buffer(&mut root_kdf_randomness);
        let root_kdf = AnnouncementRootKdf::new(&root_kdf_randomness, &kem_ss, &kem_ct, pk_peer);

        Self {
            randomness: root_kdf_randomness,
            kem_ct,
            root_kdf,
        }
    }

    /// Returns the authentication key for out-of-band verification.
    ///
    /// This key should be displayed to the user (e.g., as a QR code or hex string)
    /// and compared with the responder's copy to verify the session establishment.
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
        &self.root_kdf.auth_key
    }

    /// Finalizes the announcement with an auth payload.
    ///
    /// After optionally verifying the `auth_key` with the responder, call this
    /// method with your `auth_payload` (e.g., identity information) and your
    /// static public key to create the final announcement bytes.
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
    /// # Security Warning
    ///
    /// **Length Leakage**: This method does not pad the `auth_payload`, so the
    /// announcement size reveals information about the payload length. If the
    /// `auth_payload` contains sensitive information whose length should be hidden,
    /// ensure proper padding is applied upstream before calling this method.
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
    /// let announcement = precursor.finalize(b"Hello from Alice!", &alice_pk);
    ///
    /// // Send announcement.announcement_bytes() to Bob
    /// ```
    #[must_use]
    pub fn finalize(self, auth_payload: &[u8], pk_self: &kem::PublicKey) -> OutgoingAnnouncement {
        let integrity_kdf =
            MessageIntegrityKdf::new(&self.root_kdf.integrity_seed, pk_self, auth_payload);

        let mut ciphertext = Zeroizing::new([auth_payload, &integrity_kdf.integrity_key].concat());
        cipher::encrypt(
            &self.root_kdf.cipher_key,
            &self.root_kdf.cipher_nonce,
            &mut ciphertext,
        );

        let announcement_bytes = [
            self.randomness.as_slice(),
            self.kem_ct.as_bytes(),
            &ciphertext,
        ]
        .concat();

        OutgoingAnnouncement {
            announcement_bytes,
            mk_next: integrity_kdf.mk_next,
            seeker_next: integrity_kdf.seeker_next,
        }
    }
}

/// Finalized outgoing announcement ready to send.
///
/// This struct contains the announcement bytes to send to the responder,
/// as well as internal state needed to create an `Agraphon` session after
/// the responder acknowledges receipt.
///
/// Pass this to `Agraphon::from_outgoing_announcement()` to create the session.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct OutgoingAnnouncement {
    pub(crate) announcement_bytes: Vec<u8>,
    pub(crate) mk_next: [u8; 32],
    pub(crate) seeker_next: [u8; 32],
}

impl OutgoingAnnouncement {
    /// Returns the announcement bytes to send to the responder.
    ///
    /// These bytes should be transmitted to the peer through your
    /// communication channel (e.g., network, QR code).
    ///
    /// # Examples
    ///
    /// ```
    /// # use crypto_agraphon::OutgoingAnnouncementPrecursor;
    /// # use crypto_kem as kem;
    /// # use crypto_rng as rng;
    /// # let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut alice_rand);
    /// # let (_, alice_pk) = kem::generate_key_pair(alice_rand);
    /// # let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut bob_rand);
    /// # let (_, bob_pk) = kem::generate_key_pair(bob_rand);
    /// # let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
    /// # let announcement = precursor.finalize(b"Hello", &alice_pk);
    /// let bytes = announcement.announcement_bytes();
    /// // Send bytes to the peer
    /// println!("Send {} bytes to peer", bytes.len());
    /// ```
    #[must_use]
    pub fn announcement_bytes(&self) -> &[u8] {
        &self.announcement_bytes
    }
}

#[cfg(test)]
#[allow(clippy::similar_names)] // pk/sk naming is standard in cryptography
mod tests {
    use super::*;
    use crypto_rng as rng;

    #[test]
    fn test_announcement_round_trip() {
        // Generate key pairs for Alice and Bob
        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (_, alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        // Alice creates an announcement to Bob
        let outgoing_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let auth_key_alice = *outgoing_pre.auth_key();
        let auth_payload = b"Hello from Alice!";
        let outgoing = outgoing_pre.finalize(auth_payload, &alice_pk);

        // Bob receives the announcement
        let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            outgoing.announcement_bytes(),
            &bob_pk,
            &bob_sk,
        )
        .expect("Failed to decrypt announcement");

        // Verify the auth payload and key match
        assert_eq!(incoming_pre.auth_payload(), auth_payload);
        assert_eq!(*incoming_pre.auth_key(), auth_key_alice);

        // Bob finalizes with Alice's public key
        let alice_pk_bytes = *alice_pk.as_bytes();
        let incoming = incoming_pre
            .finalize(alice_pk)
            .expect("Integrity check failed");

        // Verify the peer public key matches
        assert_eq!(incoming.pk_peer.as_bytes(), &alice_pk_bytes);
    }

    #[test]
    fn test_announcement_integrity_check_fails_wrong_pk() {
        // Generate key pairs
        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (_, alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        let mut eve_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut eve_rand);
        let (_, eve_pk) = kem::generate_key_pair(eve_rand);

        // Alice creates announcement
        let outgoing_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let outgoing = outgoing_pre.finalize(b"Hello", &alice_pk);

        // Bob receives it
        let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            outgoing.announcement_bytes(),
            &bob_pk,
            &bob_sk,
        )
        .expect("Failed to decrypt");

        // Bob tries to finalize with Eve's public key (should fail)
        let result = incoming_pre.finalize(eve_pk);
        assert!(
            result.is_none(),
            "Integrity check should fail with wrong public key"
        );
    }
}
