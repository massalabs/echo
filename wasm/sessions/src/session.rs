//! Session-level secure messaging using the Agraphon protocol.
//!
//! This module implements the session layer for end-to-end encrypted messaging between two peers.
//! Sessions are established through a mutual announcement exchange and provide:
//!
//! - **End-to-end encryption**: Messages are encrypted using the Agraphon double-ratchet protocol
//! - **Forward secrecy**: Past messages remain secure even if current keys are compromised
//! - **Post-compromise security**: Security is restored after key compromise
//! - **Message ordering**: Lag detection and acknowledgment tracking
//! - **Seeker-based addressing**: Messages are identified by hashed Massa public keys derived from ephemeral keypairs
//!
//! # Protocol Flow
//!
//! 1. **Session Initiation**: Both parties create `OutgoingInitiationRequest`s containing their public keys
//! 2. **Announcement Exchange**: Announcements are posted to a public board and retrieved by the peer
//! 3. **Session Creation**: Each party combines their outgoing request with the peer's incoming request
//! 4. **Messaging**: Parties exchange encrypted messages identified by seeker hashes
//!
//! # Seeker Mechanism
//!
//! Messages are identified by "seekers" - database keys derived from hashed Massa public keys.
//! Each message uses an ephemeral Massa keypair whose public key is hashed to create the seeker.
//! This allows recipients to efficiently look up messages on a public message board without
//! scanning all messages or revealing their identity.
//!
//! # Example
//!
//! ```no_run
//! # use auth::{UserPublicKeys, UserSecretKeys, derive_keys_from_static_root_secret, StaticRootSecret};
//! # let root_secret_a = StaticRootSecret::from_passphrase(b"alice");
//! # let (alice_pk, alice_sk) = derive_keys_from_static_root_secret(&root_secret_a);
//! # let root_secret_b = StaticRootSecret::from_passphrase(b"bob");
//! # let (bob_pk, bob_sk) = derive_keys_from_static_root_secret(&root_secret_b);
//! use sessions::{OutgoingInitiationRequest, IncomingInitiationRequest, Session};
//!
//! // Alice creates an outgoing announcement
//! let (alice_announcement_bytes, alice_outgoing) =
//!     OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);
//!
//! // Bob receives it and parses it
//! let alice_incoming_at_bob =
//!     IncomingInitiationRequest::try_from(&alice_announcement_bytes, &bob_pk, &bob_sk)
//!         .expect("Failed to parse announcement");
//!
//! // Bob creates his own announcement and both establish sessions
//! let (bob_announcement_bytes, bob_outgoing) =
//!     OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);
//! let bob_incoming_at_alice =
//!     IncomingInitiationRequest::try_from(&bob_announcement_bytes, &alice_pk, &alice_sk).unwrap();
//!
//! let mut alice_session =
//!     Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);
//! let mut bob_session =
//!     Session::from_initiation_request_pair(&bob_outgoing, &alice_incoming_at_bob);
//!
//! // Alice sends a message
//! let output = alice_session.send_outgoing_message(b"Hello Bob!");
//!
//! // Bob retrieves it and decrypts
//! let seeker = alice_session.next_peer_message_seeker();
//! let received = bob_session
//!     .try_feed_incoming_message(&bob_sk, &seeker, &output.data)
//!     .expect("Failed to decrypt");
//!
//! assert_eq!(received.message, b"Hello Bob!");
//! ```

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

/// Database key suffix for message seekers.
/// Seekers are constructed as: [hash_length, hash_bytes..., MESSAGE_SEEKER_DB_KEY]
/// where hash_bytes is the massa_hash of the seeker's public key.
const MESSAGE_SEEKER_DB_KEY: &[u8] = &[1u8];

/// Session initialization payload embedded in announcements.
///
/// This is serialized, encrypted in an auth blob, and included in the announcement.
/// It contains the ephemeral Massa keypair used for seeker generation.
#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub(crate) struct SessionInitPayload {
    /// Massa keypair used to generate seeker hashes for this peer's messages
    #[zeroize(skip)]
    pub(crate) seeker_massa_keypair: massa_signature::KeyPair,
    /// Unix timestamp in milliseconds when this payload was created
    pub(crate) unix_timestamp_millis: u128,
}

/// Internal message structure containing user data and metadata.
///
/// This is an internal type used by the session layer. User code interacts with
/// raw `&[u8]` message contents instead.
#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub(crate) struct Message {
    /// Timestamp when the message was created (milliseconds since Unix epoch)
    pub timestamp: u128,
    /// Next Massa keypair for future seeker generation (part of the ratchet)
    #[zeroize(skip)]
    pub seeker_massa_keypair_next: massa_signature::KeyPair,
    /// Actual message contents provided by the user
    pub contents: Vec<u8>,
}

/// Output from sending a message.
///
/// Contains the seeker (database lookup key) and the encrypted message data
/// that should be posted to the public message board.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SendOutgoingMessageOutput {
    /// Message timestamp (milliseconds since Unix epoch)
    pub timestamp: u128,
    /// Seeker bytes - database key for message lookup on the message board
    /// Format: [hash_length, hash_bytes..., MESSAGE_SEEKER_DB_KEY]
    /// where hash_bytes is the massa_hash of the seeker public key
    pub seeker: Vec<u8>,
    /// Encrypted message data to post to the message board
    /// Format: [seeker_pubkey_len, seeker_pubkey, sig_len, signature, encrypted_agraphon_message]
    pub data: Vec<u8>,
}

/// Output from successfully decrypting an incoming message.
#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct FeedIncomingMessageOutput {
    /// Message timestamp (milliseconds since Unix epoch)
    pub timestamp: u128,
    /// Decrypted message contents
    pub message: Vec<u8>,
    /// List of seekers for our messages that were acknowledged by this message
    /// (the peer has received these messages, so we can prune them from history)
    pub newly_acknowledged_self_seekers: Vec<Vec<u8>>,
}

/// Incoming session initiation request from a peer.
///
/// Created by parsing announcement bytes received from the peer.
/// Contains their public keys and the Agraphon announcement needed to establish a session.
#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct IncomingInitiationRequest {
    /// Agraphon protocol announcement from the peer
    agraphon_announcement: crypto_agraphon::IncomingAnnouncement,
    /// Peer's long-term public keys
    pub(crate) origin_public_keys: auth::UserPublicKeys,
    /// Timestamp when the peer created this announcement (milliseconds since Unix epoch)
    pub(crate) timestamp_millis: u128,
    /// Peer's Massa keypair for generating seekers
    #[zeroize(skip)]
    seeker_massa_keypair: massa_signature::KeyPair,
}

impl IncomingInitiationRequest {
    pub fn try_from(
        bytes: &[u8],
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
    ) -> Option<Self> {
        // parse announcement precursor
        let incoming_announcement_precursor =
            crypto_agraphon::IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
                bytes,
                &our_pk.kem_public_key,
                &our_sk.kem_secret_key,
            )?;

        // get auth payload and key
        let auth_payload = incoming_announcement_precursor.auth_payload();
        let auth_key = incoming_announcement_precursor.auth_key();

        // deserialize announcement contents
        let auth_blob: auth::AuthBlob =
            bincode::serde::decode_from_slice(auth_payload, bincode::config::standard())
                .ok()?
                .0;

        // verify auth blob
        if !auth_blob.verify(auth_key) {
            return None;
        }

        // deserialize inner data
        let init_payload: SessionInitPayload = bincode::serde::decode_from_slice(
            auth_blob.public_payload(),
            bincode::config::standard(),
        )
        .ok()?
        .0;

        // finalize agraphon announcement
        let agraphon_announcement = incoming_announcement_precursor
            .finalize(auth_blob.public_keys().kem_public_key.clone())?;

        Some(Self {
            agraphon_announcement: agraphon_announcement.clone(),
            origin_public_keys: auth_blob.public_keys().clone(),
            timestamp_millis: init_payload.unix_timestamp_millis,
            seeker_massa_keypair: init_payload.seeker_massa_keypair.clone(),
        })
    }
}

#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct OutgoingInitiationRequest {
    agraphon_announcement: crypto_agraphon::OutgoingAnnouncement,
    pub(crate) timestamp_millis: u128,
    #[zeroize(skip)]
    seeker_massa_keypair: massa_signature::KeyPair,
}

impl OutgoingInitiationRequest {
    pub fn new(
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
        peer_pk: &auth::UserPublicKeys,
    ) -> (Vec<u8>, Self) {
        // get current timestamp
        let timestamp_millis = crate::utils::timestamp_millis();

        // prepare agraphon outgoing announcement precursor
        let agraphon_announcement_precursor =
            crypto_agraphon::OutgoingAnnouncementPrecursor::new(&peer_pk.kem_public_key);

        // get auth key
        let auth_key = agraphon_announcement_precursor.auth_key();

        // generate seeker keypair
        let seeker_massa_keypair =
            massa_signature::KeyPair::generate(0).expect("Failed to generate seeker keypair");

        // create initiation payload
        let session_init_payload = SessionInitPayload {
            seeker_massa_keypair: seeker_massa_keypair.clone(),
            unix_timestamp_millis: timestamp_millis,
        };
        let session_init_payload_bytes =
            bincode::serde::encode_to_vec(&session_init_payload, bincode::config::standard())
                .expect("Failed to serialize outgoing session initiation request");

        // create auth blob
        let auth_blob =
            auth::AuthBlob::new(our_pk.clone(), our_sk, session_init_payload_bytes, auth_key);
        let auth_payload_bytes = Zeroizing::new(
            bincode::serde::encode_to_vec(&auth_blob, bincode::config::standard())
                .expect("Failed to serialize auth blob"),
        );

        // finalize announcement
        let (announcement_bytes, announcement) =
            agraphon_announcement_precursor.finalize(auth_payload_bytes.as_slice());

        (announcement_bytes, Self {
            agraphon_announcement: announcement,
            timestamp_millis,
            seeker_massa_keypair,
        })
    }
}

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct Session {
    agraphon_instance: crypto_agraphon::Agraphon,
    peer_public_keys: auth::UserPublicKeys,
    #[zeroize(skip)]
    peer_seeker_massa_keypair: massa_signature::KeyPair,
    #[zeroize(skip)]
    self_seeker_massa_keypair: massa_signature::KeyPair,
}

impl Session {
    pub fn from_initiation_request_pair(
        outgoing_initiation_request: &OutgoingInitiationRequest,
        incoming_initiation_request: &IncomingInitiationRequest,
    ) -> Self {
        // create agraphon instance
        let agraphon_instance = crypto_agraphon::Agraphon::from_announcement_pair(
            &outgoing_initiation_request.agraphon_announcement,
            &incoming_initiation_request.agraphon_announcement,
        );

        // create session
        Self {
            agraphon_instance,
            peer_public_keys: incoming_initiation_request.origin_public_keys.clone(),
            peer_seeker_massa_keypair: incoming_initiation_request.seeker_massa_keypair.clone(),
            self_seeker_massa_keypair: outgoing_initiation_request.seeker_massa_keypair.clone(),
        }
    }

    fn compute_seeker(seeker_public_key: &massa_signature::PublicKey) -> Vec<u8> {
        // Hash the public key bytes to get a fixed-size identifier
        let public_key_bytes = seeker_public_key.to_bytes();
        let hash = massa_hash::Hash::compute_from(&public_key_bytes);
        let hash_bytes = hash.to_bytes();

        [
            &[hash_bytes.len() as u8],
            hash_bytes.as_slice(),
            MESSAGE_SEEKER_DB_KEY,
        ]
        .concat()
    }

    fn compute_seeker_data_to_sign(datastore_key: &[u8], message_bytes: &[u8]) -> Vec<u8> {
        [&[datastore_key.len() as u8], datastore_key, message_bytes].concat()
    }

    /// Sends an outgoing message on the session and returns the seeker and the encrypted message bytes.
    pub fn send_outgoing_message(&mut self, message: &[u8]) -> SendOutgoingMessageOutput {
        // get timestamp
        let timestamp = crate::utils::timestamp_millis();

        // generate seeker for next message on our side
        let mut seeker_keypair =
            massa_signature::KeyPair::generate(0).expect("Failed to generate seeker keypair");

        // flip with the current seeker
        std::mem::swap(&mut seeker_keypair, &mut self.self_seeker_massa_keypair);
        // seeker_keypair is now the "current" seeker

        // compute ephemeral seeker public key
        let seeker_public_key = seeker_keypair.get_public_key();

        // assemble seeker datastore key
        let seeker = Self::compute_seeker(&seeker_public_key);

        // create message
        let msg = Message {
            timestamp,
            seeker_massa_keypair_next: self.self_seeker_massa_keypair.clone(),
            contents: message.to_vec(),
        };

        // serialize message
        let msg_bytes: Zeroizing<Vec<u8>> = Zeroizing::new(
            bincode::serde::encode_to_vec(&msg, bincode::config::standard())
                .expect("Failed to serialize message"),
        );

        // feed agraphon
        let agraphon_message_bytes = self.agraphon_instance.send_outgoing_message(
            &seeker,
            &msg_bytes,
            &self.peer_public_keys.kem_public_key,
        );

        // assemble the data to sign
        let data_to_sign = Zeroizing::new(Self::compute_seeker_data_to_sign(
            &seeker,
            &agraphon_message_bytes,
        ));

        // hash the data to sign
        let hash_to_sign = massa_hash::Hash::compute_from(&data_to_sign);

        // sign the data
        let signature = seeker_keypair
            .sign(&hash_to_sign)
            .expect("Failed to sign message");
        let signature_bytes = signature.to_bytes();

        // assemble the data
        let seeker_public_key_bytes = seeker_public_key.to_bytes();
        let data = [
            &[seeker_public_key_bytes.len() as u8],
            seeker_public_key_bytes.as_slice(),
            &[signature_bytes.len() as u8],
            signature_bytes.as_slice(),
            agraphon_message_bytes.as_slice(),
        ]
        .concat();

        SendOutgoingMessageOutput {
            timestamp,
            seeker: seeker.to_vec(),
            data,
        }
    }

    /// Get the next peer message seeker.
    pub fn next_peer_message_seeker(&self) -> Vec<u8> {
        Self::compute_seeker(&self.peer_seeker_massa_keypair.get_public_key())
    }

    pub fn try_feed_incoming_message(
        &mut self,
        self_static_sk: &auth::UserSecretKeys,
        seeker: &[u8],
        message: &[u8],
    ) -> Option<FeedIncomingMessageOutput> {
        // decompose seeker
        let hash_len = *seeker.first()? as usize;
        let hash_bytes = seeker.get(1..1 + hash_len)?;
        if seeker.get(1 + hash_len..) != Some(MESSAGE_SEEKER_DB_KEY) {
            return None;
        }

        // decompose the data
        let seeker_public_key_len = *message.first()? as usize;
        let seeker_public_key_bytes = message.get(1..1 + seeker_public_key_len)?;
        let seeker_public_key =
            massa_signature::PublicKey::from_bytes(seeker_public_key_bytes).ok()?;

        let signature_offset = 1 + seeker_public_key_len;
        let signature_len = *message.get(signature_offset)? as usize;
        let signature_bytes =
            message.get(signature_offset + 1..signature_offset + 1 + signature_len)?;
        let signature = massa_signature::Signature::from_bytes(signature_bytes).ok()?;

        let message_bytes = message
            .get(signature_offset + 1 + signature_len..)?
            .to_vec();

        // check that the hash derives from the seeker public key by recomputing it
        let public_key_bytes = seeker_public_key.to_bytes();
        let expected_hash = massa_hash::Hash::compute_from(&public_key_bytes);
        let expected_hash_bytes = expected_hash.to_bytes();

        if hash_bytes != expected_hash_bytes.as_slice() {
            return None;
        }

        // check that the signature is valid
        let data_to_sign = Self::compute_seeker_data_to_sign(seeker, &message_bytes);
        let hash_to_verify = massa_hash::Hash::compute_from(&data_to_sign);
        if seeker_public_key
            .verify_signature(&hash_to_verify, &signature)
            .is_err()
        {
            return None;
        }

        // try to read message from agraphon
        let agraphon_result = self
            .agraphon_instance
            .try_feed_incoming_message(&self_static_sk.kem_secret_key, &message_bytes)?;

        // deserialize the message
        let message: Message = bincode::serde::decode_from_slice(
            &agraphon_result.message_bytes,
            bincode::config::standard(),
        )
        .ok()?
        .0;

        // update peer seeker keypair for next message
        self.peer_seeker_massa_keypair = message.seeker_massa_keypair_next.clone();

        Some(FeedIncomingMessageOutput {
            timestamp: message.timestamp,
            message: message.contents.clone(),
            newly_acknowledged_self_seekers: agraphon_result
                .newly_acknowledged_self_seekers
                .clone(),
        })
    }

    /// Gets the lag length.
    pub fn lag_length(&self) -> u64 {
        self.agraphon_instance.lag_length()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generate_test_keypair() -> (auth::UserPublicKeys, auth::UserSecretKeys) {
        // Generate a random passphrase for testing
        let mut passphrase = [0u8; 32];
        crypto_rng::fill_buffer(&mut passphrase);
        let root_secret = auth::StaticRootSecret::from_passphrase(&passphrase);
        auth::derive_keys_from_static_root_secret(&root_secret)
    }

    fn create_test_message(contents: &[u8]) -> Message {
        Message {
            timestamp: crate::utils::timestamp_millis(),
            seeker_massa_keypair_next: massa_signature::KeyPair::generate(0)
                .expect("Failed to generate placeholder keypair"),
            contents: contents.to_vec(),
        }
    }

    // Tests for internal Message type removed - Message is now internal implementation detail
    // and is created automatically by send_outgoing_message

    #[test]
    fn test_outgoing_initiation_request_creation() {
        let (our_pk, our_sk) = generate_test_keypair();
        let (peer_pk, _peer_sk) = generate_test_keypair();

        let (announcement_bytes, outgoing_req) =
            OutgoingInitiationRequest::new(&our_pk, &our_sk, &peer_pk);

        assert!(!announcement_bytes.is_empty());
        assert!(outgoing_req.timestamp_millis > 0);
    }

    #[test]
    fn test_incoming_initiation_request_parsing() {
        let (our_pk, our_sk) = generate_test_keypair();
        let (peer_pk, peer_sk) = generate_test_keypair();

        // Create an outgoing request from peer's perspective
        let (announcement_bytes, _) = OutgoingInitiationRequest::new(&peer_pk, &peer_sk, &our_pk);

        // Parse it as incoming from our perspective
        let incoming_req =
            IncomingInitiationRequest::try_from(&announcement_bytes, &our_pk, &our_sk);

        assert!(incoming_req.is_some());
        let incoming_req = incoming_req.unwrap();
        assert!(incoming_req.timestamp_millis > 0);
        assert_eq!(
            incoming_req.origin_public_keys.derive_id(),
            peer_pk.derive_id()
        );
    }

    #[test]
    fn test_incoming_initiation_request_wrong_recipient() {
        let (our_pk, our_sk) = generate_test_keypair();
        let (peer_pk, peer_sk) = generate_test_keypair();
        let (wrong_pk, _wrong_sk) = generate_test_keypair();

        // Create an announcement for wrong_pk
        let (announcement_bytes, _) = OutgoingInitiationRequest::new(&peer_pk, &peer_sk, &wrong_pk);

        // Try to parse with our keys - should fail
        let incoming_req =
            IncomingInitiationRequest::try_from(&announcement_bytes, &our_pk, &our_sk);

        assert!(incoming_req.is_none());
    }

    #[test]
    fn test_incoming_initiation_request_invalid_data() {
        let (our_pk, our_sk) = generate_test_keypair();
        let invalid_bytes = b"not a valid announcement";

        let incoming_req = IncomingInitiationRequest::try_from(invalid_bytes, &our_pk, &our_sk);
        assert!(incoming_req.is_none());
    }

    #[test]
    fn test_session_creation_from_initiation_pair() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Alice creates outgoing request to Bob
        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);

        // Bob creates outgoing request to Alice
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);

        // Alice receives Bob's announcement
        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk)
                .expect("Failed to parse Bob's announcement at Alice");

        // Bob receives Alice's announcement
        let alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk)
                .expect("Failed to parse Alice's announcement at Bob");

        // Both create sessions
        let _alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);
        let _bob_session =
            Session::from_initiation_request_pair(&bob_outgoing, &alice_incoming_at_bob);

        // Sessions created successfully (KeyPairs are generated randomly, so we can't compare them)
    }

    #[test]
    fn test_session_send_and_receive_message() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let _timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();

        let mut alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);
        let mut bob_session =
            Session::from_initiation_request_pair(&bob_outgoing, &alice_incoming_at_bob);

        // Alice sends a message to Bob
        let message = create_test_message(b"Hello Bob!");
        let send_output = alice_session.send_outgoing_message(&message.contents);

        assert!(!send_output.seeker.is_empty());
        assert!(!send_output.data.is_empty());

        // Bob receives the message
        let receive_output = bob_session
            .try_feed_incoming_message(&bob_sk, &send_output.seeker, &send_output.data)
            .expect("Failed to decrypt message");

        assert_eq!(receive_output.message, b"Hello Bob!");
        // Timestamps might differ slightly due to test timing
        assert!((receive_output.timestamp as u128).abs_diff(message.timestamp) < 10);
    }

    #[test]
    fn test_session_bidirectional_messaging() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let _timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();

        let mut alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);
        let mut bob_session =
            Session::from_initiation_request_pair(&bob_outgoing, &alice_incoming_at_bob);

        // Alice -> Bob
        let msg1 = create_test_message(b"Hello Bob!");
        let output1 = alice_session.send_outgoing_message(&msg1.contents);
        let received1 = bob_session
            .try_feed_incoming_message(&bob_sk, &output1.seeker, &output1.data)
            .unwrap();
        assert_eq!(received1.message, b"Hello Bob!");

        // Bob -> Alice
        let msg2 = create_test_message(b"Hi Alice!");
        let output2 = bob_session.send_outgoing_message(&msg2.contents);
        let received2 = alice_session
            .try_feed_incoming_message(&alice_sk, &output2.seeker, &output2.data)
            .unwrap();
        assert_eq!(received2.message, b"Hi Alice!");

        // Alice -> Bob (second message)
        let msg3 = create_test_message(b"How are you?");
        let output3 = alice_session.send_outgoing_message(&msg3.contents);
        let received3 = bob_session
            .try_feed_incoming_message(&bob_sk, &output3.seeker, &output3.data)
            .unwrap();
        assert_eq!(received3.message, b"How are you?");
    }

    #[test]
    fn test_session_wrong_recipient_cannot_decrypt() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();
        let (eve_pk, eve_sk) = generate_test_keypair();

        // Establish session between Alice and Bob
        let _timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);
        let (bob_announcement, _bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let _alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();

        let mut alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);

        // Eve establishes her own session with Alice
        let (eve_announcement, eve_outgoing) =
            OutgoingInitiationRequest::new(&eve_pk, &eve_sk, &alice_pk);
        let eve_incoming_at_alice =
            IncomingInitiationRequest::try_from(&eve_announcement, &alice_pk, &alice_sk).unwrap();
        let (alice_to_eve_announcement, _alice_to_eve_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &eve_pk);
        let _alice_incoming_at_eve =
            IncomingInitiationRequest::try_from(&alice_to_eve_announcement, &eve_pk, &eve_sk)
                .unwrap();
        let mut eve_session =
            Session::from_initiation_request_pair(&eve_outgoing, &eve_incoming_at_alice);

        // Alice sends message to Bob
        let message = create_test_message(b"Secret message for Bob");
        let send_output = alice_session.send_outgoing_message(&message.contents);

        // Eve tries to decrypt (should fail)
        let eve_attempt =
            eve_session.try_feed_incoming_message(&eve_sk, &send_output.seeker, &send_output.data);
        assert!(eve_attempt.is_none());
    }

    #[test]
    fn test_session_seeker_construction() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);
        let (bob_announcement, _bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let _alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();
        let alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);

        // Get seeker for next peer message
        let peer_seeker = alice_session.next_peer_message_seeker();

        // Seeker should now be a Massa hash of the public key (starts with length byte, then hash bytes, then MESSAGE_SEEKER_DB_KEY)
        assert!(!peer_seeker.is_empty());
        // Just verify it's non-empty and has reasonable structure
        assert!(peer_seeker.len() > 10); // Hash + metadata
    }

    #[test]
    fn test_session_lag_length() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);
        let (bob_announcement, _bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let _alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();
        let mut alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);

        // Get initial lag
        let initial_lag = alice_session.lag_length();

        // Send messages (lag increases without acknowledgments)
        alice_session.send_outgoing_message(&create_test_message(b"msg1").contents);
        let lag1 = alice_session.lag_length();
        assert!(lag1 > initial_lag);

        alice_session.send_outgoing_message(&create_test_message(b"msg2").contents);
        let lag2 = alice_session.lag_length();
        assert!(lag2 > lag1);
    }

    #[test]
    fn test_session_acknowledgments() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let _timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();

        let mut alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);
        let mut bob_session =
            Session::from_initiation_request_pair(&bob_outgoing, &alice_incoming_at_bob);

        // Alice sends multiple messages
        let msg1 = create_test_message(b"msg1");
        let output1 = alice_session.send_outgoing_message(&msg1.contents);
        let msg2 = create_test_message(b"msg2");
        let _output2 = alice_session.send_outgoing_message(&msg2.contents);

        // Bob receives first message
        let received1 = bob_session
            .try_feed_incoming_message(&bob_sk, &output1.seeker, &output1.data)
            .unwrap();
        assert_eq!(received1.message, b"msg1");

        // Bob sends a reply (which acknowledges Alice's messages)
        let reply = create_test_message(b"reply");
        let reply_output = bob_session.send_outgoing_message(&reply.contents);

        // Alice receives Bob's reply
        let received_reply = alice_session
            .try_feed_incoming_message(&alice_sk, &reply_output.seeker, &reply_output.data)
            .unwrap();
        assert_eq!(received_reply.message, b"reply");

        // Check if there are newly acknowledged seekers
        assert!(!received_reply.newly_acknowledged_self_seekers.is_empty());
    }

    #[test]
    fn test_session_empty_message() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let _timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();

        let mut alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);
        let mut bob_session =
            Session::from_initiation_request_pair(&bob_outgoing, &alice_incoming_at_bob);

        // Send empty message (for keep-alive)
        let empty_message = create_test_message(b"");
        let send_output = alice_session.send_outgoing_message(&empty_message.contents);

        let receive_output = bob_session
            .try_feed_incoming_message(&bob_sk, &send_output.seeker, &send_output.data)
            .unwrap();

        assert!(receive_output.message.is_empty());
    }

    #[test]
    fn test_session_large_message() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let _timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk);
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();

        let mut alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);
        let mut bob_session =
            Session::from_initiation_request_pair(&bob_outgoing, &alice_incoming_at_bob);

        // Send large message (10KB)
        let large_content = vec![42u8; 10_000];
        let large_message = create_test_message(&large_content);
        let send_output = alice_session.send_outgoing_message(&large_message.contents);

        let receive_output = bob_session
            .try_feed_incoming_message(&bob_sk, &send_output.seeker, &send_output.data)
            .unwrap();

        assert_eq!(receive_output.message, large_content);
    }

    // test_seeker_prefix_uniqueness removed - seekers now use randomly generated Massa keypairs,
    // so uniqueness is guaranteed by cryptographic randomness rather than prefixes
}
