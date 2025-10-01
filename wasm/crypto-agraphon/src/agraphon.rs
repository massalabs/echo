//! Main session state machine for secure asynchronous messaging.

use crate::announcement::{IncomingAnnouncement, OutgoingAnnouncement};
use crate::history::{HistoryItemPeer, HistoryItemSelf};
use crate::message_integrity_kdf::MessageIntegrityKdf;
use crate::message_root_kdf::MessageRootKdf;
use crate::seeker_kdf::SeekerKdf;
use crate::types::{KeySource, Role};
use crypto_cipher as cipher;
use crypto_kem as kem;
use crypto_rng as rng;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// The main session state machine for secure asynchronous messaging.
///
/// `Agraphon` implements a Double Ratchet-like protocol that provides:
/// - **Forward secrecy**: Past messages remain secure even if current keys are compromised
/// - **Post-compromise security**: Security is restored after compromised keys are replaced
/// - **Asynchronous communication**: Messages can be sent without waiting for responses
/// - **Out-of-order delivery**: Messages can arrive in any order
/// - **Post-quantum security**: Compatible with quantum-resistant algorithms
///
/// # Protocol Overview
///
/// Each `Agraphon` session is created from either an incoming or outgoing announcement.
/// The session maintains:
/// - A history of our recently sent messages (for processing out-of-order responses)
/// - The peer's most recent message state
/// - Our role (Initiator or Responder) for key derivation
///
/// # Creating a Session
///
/// From an incoming announcement (as Responder):
/// ```no_run
/// # use crypto_agraphon::{Agraphon, IncomingAnnouncement};
/// # use crypto_kem as kem;
/// # let incoming: IncomingAnnouncement = todo!();
/// # let my_pk: kem::PublicKey = todo!();
/// let session = Agraphon::try_from_incoming_announcement(incoming, &my_pk)
///     .expect("Failed to create session");
/// ```
///
/// From an outgoing announcement (as Initiator):
/// ```no_run
/// # use crypto_agraphon::{Agraphon, OutgoingAnnouncement};
/// # use crypto_kem as kem;
/// # let outgoing: OutgoingAnnouncement = todo!();
/// # let peer_pk: kem::PublicKey = todo!();
/// let session = Agraphon::from_outgoing_announcement(outgoing, peer_pk);
/// ```
///
/// # Sending Messages
///
/// ```no_run
/// # use crypto_agraphon::Agraphon;
/// # let mut session: Agraphon = todo!();
/// let plaintext = b"Hello, world!";
/// let ciphertext = session.send_outgoing_message(plaintext);
/// // Send ciphertext to peer
/// ```
///
/// # Receiving Messages
///
/// When a message arrives, first compute seekers to identify which of our
/// messages the peer is responding to:
///
/// ```no_run
/// # use crypto_agraphon::Agraphon;
/// # use crypto_kem as kem;
/// # let mut session: Agraphon = todo!();
/// # let received_ciphertext: Vec<u8> = todo!();
/// # let my_static_sk: kem::SecretKey = todo!();
/// let seekers = session.possible_incoming_message_seekers();
/// // Match received message's seeker against these
/// # let parent_id = 0;
///
/// let plaintext = session.try_feed_incoming_message(
///     parent_id,
///     &my_static_sk,
///     &received_ciphertext,
/// ).expect("Failed to decrypt message");
/// ```
#[derive(Serialize, Deserialize)]
pub struct Agraphon {
    role: Role,
    self_msg_history: VecDeque<HistoryItemSelf>,
    latest_peer_msg: HistoryItemPeer,
}

impl Agraphon {
    /// Creates a session from an incoming announcement (as Responder).
    ///
    /// After receiving and verifying an announcement from the initiator,
    /// call this method to create your session. You become the Responder
    /// in this session.
    ///
    /// # Arguments
    ///
    /// * `incoming_announcement` - The finalized incoming announcement
    /// * `pk_self` - Your static public key
    ///
    /// # Returns
    ///
    /// `Some(Agraphon)` session, or `None` if creation fails.
    ///
    /// # Examples
    ///
    /// ```
    /// use crypto_agraphon::{Agraphon, IncomingAnnouncementPrecursor};
    /// use crypto_kem as kem;
    /// use crypto_rng as rng;
    ///
    /// // Assuming you've received announcement_bytes from the initiator
    /// # let announcement_bytes = vec![0u8; 100]; // dummy data
    /// # let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut bob_rand);
    /// # let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);
    /// # let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// # rng::fill_buffer(&mut alice_rand);
    /// # let (_, alice_pk) = kem::generate_key_pair(alice_rand);
    ///
    /// // Decrypt and verify announcement
    /// # /*
    /// let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
    ///     &announcement_bytes,
    ///     &bob_pk,
    ///     &bob_sk,
    /// ).expect("Failed to decrypt");
    ///
    /// // Verify auth_payload and auth_key...
    /// let incoming = incoming_pre.finalize(alice_pk).expect("Integrity check failed");
    ///
    /// // Create session
    /// let mut session = Agraphon::try_from_incoming_announcement(incoming, &bob_pk)
    ///     .expect("Failed to create session");
    /// # */
    /// ```
    pub fn try_from_incoming_announcement(
        incoming_announcement: IncomingAnnouncement,
        pk_self: &kem::PublicKey,
    ) -> Option<Self> {
        let mut self_msg_history = VecDeque::new();
        self_msg_history.push_back(HistoryItemSelf::initial(pk_self));

        let latest_peer_msg = HistoryItemPeer {
            our_parent_id: 0,
            pk_next: incoming_announcement.pk_peer,
            mk_next: incoming_announcement.mk_next,
            seeker_next: incoming_announcement.seeker_next,
        };

        Some(Self {
            role: Role::Responder,
            self_msg_history,
            latest_peer_msg,
        })
    }

    /// Creates a session from an outgoing announcement (as Initiator).
    ///
    /// After sending an announcement to the responder, call this method
    /// to create your session. You become the Initiator in this session.
    ///
    /// # Arguments
    ///
    /// * `outgoing_announcement` - The finalized outgoing announcement
    /// * `pk_peer` - The responder's static public key
    ///
    /// # Returns
    ///
    /// An `Agraphon` session ready to send and receive messages.
    ///
    /// # Examples
    ///
    /// ```
    /// use crypto_agraphon::{Agraphon, OutgoingAnnouncementPrecursor};
    /// use crypto_kem as kem;
    /// use crypto_rng as rng;
    ///
    /// // Generate key pairs
    /// let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut alice_rand);
    /// let (_, alice_pk) = kem::generate_key_pair(alice_rand);
    ///
    /// let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
    /// rng::fill_buffer(&mut bob_rand);
    /// let (_, bob_pk) = kem::generate_key_pair(bob_rand);
    ///
    /// // Create and finalize announcement
    /// let precursor = OutgoingAnnouncementPrecursor::new(&bob_pk);
    /// let announcement = precursor.finalize(b"Hello from Alice", &alice_pk);
    ///
    /// // Send announcement.announcement_bytes() to Bob...
    ///
    /// // Create session
    /// let mut session = Agraphon::from_outgoing_announcement(announcement, bob_pk);
    /// ```
    pub fn from_outgoing_announcement(
        outgoing_announcement: OutgoingAnnouncement,
        pk_peer: kem::PublicKey,
    ) -> Self {
        let mut self_msg_history = VecDeque::new();
        self_msg_history.push_back(HistoryItemSelf {
            local_id: 1,
            sk_next: KeySource::Static,
            mk_next: outgoing_announcement.mk_next,
            seeker_next: outgoing_announcement.seeker_next,
        });

        let latest_peer_msg = HistoryItemPeer::initial(pk_peer);

        Self {
            role: Role::Initiator,
            self_msg_history,
            latest_peer_msg,
        }
    }

    /// Returns possible seekers for identifying incoming messages.
    ///
    /// When you receive a message from the peer, it will include a seeker that
    /// identifies which of your sent messages they're responding to. Use this
    /// method to compute all possible seekers, then match the received seeker
    /// against this list to find the `our_parent_id` for decryption.
    ///
    /// # Returns
    ///
    /// A vector of `(local_id, seeker)` pairs, ordered from most recent to oldest.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use crypto_agraphon::Agraphon;
    /// # let session: Agraphon = todo!();
    /// let seekers = session.possible_incoming_message_seekers();
    ///
    /// // When you receive a message with seeker `received_seeker`:
    /// # let received_seeker = [0u8; 32];
    /// let parent_id = seekers.iter()
    ///     .find(|(_, s)| s == &received_seeker)
    ///     .map(|(id, _)| *id)
    ///     .expect("No matching seeker found");
    /// ```
    pub fn possible_incoming_message_seekers(&self) -> Vec<(u64, [u8; 32])> {
        let mut seekers = Vec::with_capacity(self.self_msg_history.len());
        for item in self.self_msg_history.iter().rev() {
            let seeker_kdf = SeekerKdf::new(&self.latest_peer_msg.seeker_next, &item.seeker_next);
            seekers.push((item.local_id, seeker_kdf.seeker));
        }
        seekers
    }

    /// Internal helper to retrieve a sent message by its local ID.
    fn get_self_message_by_id(&self, local_id: u64) -> Option<&HistoryItemSelf> {
        let first_id = self.self_msg_history.front()?.local_id;
        let index = local_id.checked_sub(first_id)?;
        self.self_msg_history.get(index.try_into().ok()?)
    }

    /// Attempts to decrypt and process an incoming message.
    ///
    /// When you receive a message from the peer, first match its seeker against
    /// `possible_incoming_message_seekers()` to determine `our_parent_id`, then
    /// call this method to decrypt the message and update the session state.
    ///
    /// # Arguments
    ///
    /// * `our_parent_id` - Which of our sent messages the peer is responding to
    /// * `self_static_sk` - Our static secret key (for decrypting KEM ciphertext)
    /// * `message` - The encrypted message bytes
    ///
    /// # Returns
    ///
    /// `Some(plaintext)` if decryption succeeds and the integrity check passes,
    /// `None` if the message is malformed, cannot be decrypted, or fails integrity check.
    ///
    /// # Side Effects
    ///
    /// On success:
    /// - Updates `latest_peer_msg` with the peer's new state
    /// - Prunes old messages from our history (messages older than `our_parent_id`)
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use crypto_agraphon::Agraphon;
    /// # use crypto_kem as kem;
    /// # let mut session: Agraphon = todo!();
    /// # let static_sk: kem::SecretKey = todo!();
    /// # let received_message: Vec<u8> = todo!();
    /// // Compute seekers and match against received message's seeker
    /// let seekers = session.possible_incoming_message_seekers();
    /// # let parent_id = 0; // Found by matching seeker
    ///
    /// let plaintext = session.try_feed_incoming_message(
    ///     parent_id,
    ///     &static_sk,
    ///     &received_message,
    /// ).expect("Failed to decrypt message");
    ///
    /// println!("Received: {}", String::from_utf8_lossy(&plaintext));
    /// ```
    pub fn try_feed_incoming_message(
        &mut self,
        our_parent_id: u64,
        self_static_sk: &kem::SecretKey,
        message: &[u8],
    ) -> Option<Vec<u8>> {
        let self_msg = &self.latest_peer_msg;
        let peer_msg = self.get_self_message_by_id(our_parent_id)?;

        let msg_ct: [u8; kem::CIPHERTEXT_SIZE] =
            message.get(..kem::CIPHERTEXT_SIZE)?.try_into().ok()?;
        let msg_ct: kem::Ciphertext = msg_ct.into();

        let msg_sk = match &peer_msg.sk_next {
            KeySource::Static => self_static_sk,
            KeySource::Ephemeral(sk) => sk,
        };
        let msg_ss = kem::decapsulate(msg_sk, &msg_ct);

        let msg_root_kdf = MessageRootKdf::new(
            &self_msg.mk_next,
            &peer_msg.mk_next,
            &msg_ss,
            &msg_ct,
            self.role.opposite(),
        );

        let mut content = message.get(kem::CIPHERTEXT_SIZE..)?.to_vec();
        cipher::decrypt(
            &msg_root_kdf.cipher_key,
            &msg_root_kdf.cipher_nonce,
            &mut content,
        );

        let pk_next: [u8; kem::PUBLIC_KEY_SIZE] =
            content.get(..kem::PUBLIC_KEY_SIZE)?.try_into().ok()?;
        let pk_next: kem::PublicKey = pk_next.into();

        let payload_end_index = content.len().checked_sub(32)?;
        let payload = content
            .get(kem::PUBLIC_KEY_SIZE..payload_end_index)?
            .to_vec();

        let integrity_key: [u8; 32] = content.get(payload_end_index..)?.try_into().ok()?;

        let integrity_kdf =
            MessageIntegrityKdf::new(&msg_root_kdf.integrity_seed, &pk_next, &payload);

        if integrity_key != integrity_kdf.integrity_key {
            return None;
        }

        self.latest_peer_msg = HistoryItemPeer {
            our_parent_id,
            pk_next,
            mk_next: integrity_kdf.mk_next,
            seeker_next: integrity_kdf.seeker_next,
        };

        while self
            .self_msg_history
            .front()
            .map_or(false, |msg| msg.local_id < our_parent_id)
        {
            self.self_msg_history.pop_front();
        }

        Some(payload)
    }

    /// Encrypts and sends an outgoing message.
    ///
    /// Encrypts the payload, generates a new ephemeral key pair for forward secrecy,
    /// and updates the session state. Returns the encrypted message bytes to send
    /// to the peer.
    ///
    /// # Arguments
    ///
    /// * `payload` - The plaintext message to send
    ///
    /// # Returns
    ///
    /// Encrypted message bytes to transmit to the peer.
    ///
    /// # Security Warning
    ///
    /// **Message Length Leakage**: This method does not pad the payload, so the
    /// ciphertext length reveals information about the plaintext length. For
    /// applications requiring traffic analysis resistance, pad the payload before
    /// calling this method.
    ///
    /// # Side Effects
    ///
    /// - Generates a new ephemeral key pair
    /// - Adds a new history item to `self_msg_history`
    /// - Increments the local message ID
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use crypto_agraphon::Agraphon;
    /// # let mut session: Agraphon = todo!();
    /// let plaintext = b"Hello, peer!";
    /// let ciphertext = session.send_outgoing_message(plaintext);
    ///
    /// // Send ciphertext to peer over your transport channel
    /// println!("Sending {} bytes", ciphertext.len());
    /// ```
    ///
    /// # With Padding
    ///
    /// ```no_run
    /// # use crypto_agraphon::Agraphon;
    /// # let mut session: Agraphon = todo!();
    /// // Pad to nearest 1KB to hide length
    /// let plaintext = b"Hello, peer!";
    /// let target_len = ((plaintext.len() + 1023) / 1024) * 1024;
    /// let mut padded = plaintext.to_vec();
    /// padded.resize(target_len, 0);
    ///
    /// let ciphertext = session.send_outgoing_message(&padded);
    /// ```
    pub fn send_outgoing_message(&mut self, payload: &[u8]) -> Vec<u8> {
        let self_msg = self
            .self_msg_history
            .back()
            .expect("Self message history unexpectedly empty");
        let peer_msg = &self.latest_peer_msg;

        let mut kem_randomness = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut kem_randomness);
        let (msg_ct, msg_ss) = kem::encapsulate(&peer_msg.pk_next, kem_randomness);

        let msg_root_kdf = MessageRootKdf::new(
            &self_msg.mk_next,
            &peer_msg.mk_next,
            &msg_ss,
            &msg_ct,
            self.role,
        );

        let mut pk_next_randomness = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_next_randomness);
        let (sk_next, pk_next) = kem::generate_key_pair(pk_next_randomness);

        let integrity_kdf: MessageIntegrityKdf =
            MessageIntegrityKdf::new(&msg_root_kdf.integrity_seed, &pk_next, &payload);

        let mut ciphertext = [pk_next.as_bytes(), payload, &integrity_kdf.integrity_key].concat();
        cipher::encrypt(
            &msg_root_kdf.cipher_key,
            &msg_root_kdf.cipher_nonce,
            &mut ciphertext,
        );

        self.self_msg_history.push_back(HistoryItemSelf {
            local_id: self_msg.local_id + 1,
            sk_next: KeySource::Ephemeral(sk_next),
            mk_next: integrity_kdf.mk_next,
            seeker_next: integrity_kdf.seeker_next,
        });

        let message_bytes = [msg_ct.as_bytes().as_slice(), &ciphertext].concat();

        message_bytes
    }

    /// Returns the number of unacknowledged messages.
    ///
    /// This is the difference between our latest message ID and the message ID
    /// that the peer was responding to in their most recent message. It indicates
    /// how many of our messages are "in flight" or haven't been acknowledged yet.
    ///
    /// # Returns
    ///
    /// The number of messages we've sent since the last message the peer acknowledged.
    ///
    /// # Use Cases
    ///
    /// - **Flow Control**: Stop sending if lag is too high
    /// - **Reliability**: Resend if lag indicates message loss
    /// - **Diagnostics**: Monitor session health
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use crypto_agraphon::Agraphon;
    /// # let session: Agraphon = todo!();
    /// let lag = session.lag_length();
    /// if lag > 10 {
    ///     println!("Warning: {} unacknowledged messages", lag);
    ///     // Maybe pause sending or retry
    /// }
    /// ```
    pub fn lag_length(&self) -> u64 {
        let our_latest_local_id = self
            .self_msg_history
            .back()
            .expect("Self message history unexpectedly empty")
            .local_id;

        let peer_latest_parent_local_id = self.latest_peer_msg.our_parent_id;

        let delta = our_latest_local_id
            .checked_sub(peer_latest_parent_local_id)
            .expect("Self lag is negative");

        delta
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::announcement::{IncomingAnnouncementPrecursor, OutgoingAnnouncementPrecursor};
    use crypto_rng as rng;

    #[test]
    fn test_session_creation_and_message_exchange() {
        // Generate key pairs for Alice and Bob
        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (_alice_sk, alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        // Alice initiates session with Bob
        let announcement_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let announcement = announcement_pre.finalize(b"Alice's auth data", &alice_pk);

        // Bob receives announcement
        let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            announcement.announcement_bytes(),
            &bob_pk,
            &bob_sk,
        )
        .expect("Failed to decrypt announcement");
        let incoming = incoming_pre
            .finalize(alice_pk)
            .expect("Integrity check failed");

        // Create Bob's session first (needs &bob_pk)
        let mut bob_session = Agraphon::try_from_incoming_announcement(incoming, &bob_pk)
            .expect("Failed to create Bob's session");

        // Then create Alice's session (takes ownership of bob_pk)
        let mut alice_session = Agraphon::from_outgoing_announcement(announcement, bob_pk);

        // Alice sends a message to Bob
        let plaintext = b"Hello, Bob!";
        let ciphertext = alice_session.send_outgoing_message(plaintext);

        // Bob decrypts the message
        let decrypted = bob_session
            .try_feed_incoming_message(0, &bob_sk, &ciphertext)
            .expect("Failed to decrypt message");

        assert_eq!(&decrypted, plaintext);
    }

    #[test]
    fn test_bidirectional_message_exchange() {
        // Setup sessions
        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (alice_sk, alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);

        let announcement_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let announcement = announcement_pre.finalize(b"auth", &alice_pk);

        let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
            announcement.announcement_bytes(),
            &bob_pk,
            &bob_sk,
        )
        .unwrap();
        let incoming = incoming_pre.finalize(alice_pk).unwrap();

        // Create Bob's session first (needs &bob_pk)
        let mut bob_session = Agraphon::try_from_incoming_announcement(incoming, &bob_pk).unwrap();

        // Then create Alice's session (takes ownership of bob_pk)
        let mut alice_session = Agraphon::from_outgoing_announcement(announcement, bob_pk);

        // Alice -> Bob
        let msg1 = alice_session.send_outgoing_message(b"Message 1");
        let dec1 = bob_session
            .try_feed_incoming_message(0, &bob_sk, &msg1)
            .unwrap();
        assert_eq!(&dec1, b"Message 1");

        // Bob -> Alice (responding to Alice's message with local_id 2)
        let msg2 = bob_session.send_outgoing_message(b"Reply to message 1");
        let dec2 = alice_session
            .try_feed_incoming_message(2, &alice_sk, &msg2)
            .unwrap();
        assert_eq!(&dec2, b"Reply to message 1");

        // Alice -> Bob again (responding to Bob's message with local_id 1)
        let msg3 = alice_session.send_outgoing_message(b"Message 3");
        let dec3 = bob_session
            .try_feed_incoming_message(1, &bob_sk, &msg3)
            .unwrap();
        assert_eq!(&dec3, b"Message 3");
    }

    #[test]
    fn test_lag_length() {
        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (_, alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (_, bob_pk) = kem::generate_key_pair(bob_rand);

        let announcement_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let announcement = announcement_pre.finalize(b"auth", &alice_pk);
        let mut alice_session = Agraphon::from_outgoing_announcement(announcement, bob_pk);

        // Initial lag should be 1 (we have sent the announcement)
        assert_eq!(alice_session.lag_length(), 1);

        // Send more messages
        alice_session.send_outgoing_message(b"msg1");
        assert_eq!(alice_session.lag_length(), 2);

        alice_session.send_outgoing_message(b"msg2");
        assert_eq!(alice_session.lag_length(), 3);
    }

    #[test]
    fn test_possible_incoming_message_seekers() {
        let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut alice_rand);
        let (_, alice_pk) = kem::generate_key_pair(alice_rand);

        let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut bob_rand);
        let (_, bob_pk) = kem::generate_key_pair(bob_rand);

        let announcement_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
        let announcement = announcement_pre.finalize(b"auth", &alice_pk);
        let mut alice_session = Agraphon::from_outgoing_announcement(announcement, bob_pk);

        // Initial seekers should include message ID 1
        let seekers = alice_session.possible_incoming_message_seekers();
        assert_eq!(seekers.len(), 1);
        assert_eq!(seekers[0].0, 1); // First message has ID 1

        // Send more messages
        alice_session.send_outgoing_message(b"msg1");
        alice_session.send_outgoing_message(b"msg2");

        let seekers = alice_session.possible_incoming_message_seekers();
        assert_eq!(seekers.len(), 3);
        // Should be in reverse order (most recent first)
        assert_eq!(seekers[0].0, 3);
        assert_eq!(seekers[1].0, 2);
        assert_eq!(seekers[2].0, 1);
    }
}
