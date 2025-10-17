use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub(crate) struct SessionInitPayload {
    pub(crate) seeker_prefix: Vec<u8>,
    pub(crate) unix_timestamp_millis: u128,
}

#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct Message {
    pub timestamp: u128,
    pub contents: Vec<u8>,
}

#[derive(Zeroize, ZeroizeOnDrop)]

pub struct SendOutgoingMessageOutput {
    pub seeker: Vec<u8>,
    pub ciphertext: Vec<u8>,
}

#[derive(Zeroize, ZeroizeOnDrop)]

pub struct FeedIncomingMessageOutput {
    pub message: Message,
    pub newly_acknowledged_self_seekers: Vec<Vec<u8>>,
}

#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct IncomingInitiationRequest {
    agraphon_announcement: crypto_agraphon::IncomingAnnouncement,
    pub(crate) origin_public_keys: auth::UserPublicKeys,
    pub(crate) timestamp_millis: u128,
    seeker_prefix: Vec<u8>,
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
        let auth_blob: auth::AuthBlob = bincode::deserialize(auth_payload).ok()?;

        // verify auth blob
        if !auth_blob.verify(auth_key) {
            return None;
        }

        // deserialize inner data
        let init_payload: SessionInitPayload =
            bincode::deserialize(auth_blob.public_payload()).ok()?;

        // check seeker prefix length
        let _seeker_prefix_length: u8 = init_payload.seeker_prefix.len().try_into().ok()?;

        // finalize agraphon announcement
        let agraphon_announcement = incoming_announcement_precursor
            .finalize(auth_blob.public_keys().kem_public_key.clone())?;

        Some(Self {
            agraphon_announcement: agraphon_announcement.clone(),
            origin_public_keys: auth_blob.public_keys().clone(),
            timestamp_millis: init_payload.unix_timestamp_millis,
            seeker_prefix: init_payload.seeker_prefix.clone(),
        })
    }
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct OutgoingInitiationRequest {
    agraphon_announcement: crypto_agraphon::OutgoingAnnouncement,
    pub(crate) timestamp_millis: u128,
    seeker_prefix: Vec<u8>,
}

impl OutgoingInitiationRequest {
    pub fn new(
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
        peer_pk: &auth::UserPublicKeys,
        seeker_prefix: &[u8],
        timestamp_millis: u128,
    ) -> (Vec<u8>, Self) {
        // prepare agraphon outgoing announcement precursor
        let agraphon_announcement_precursor =
            crypto_agraphon::OutgoingAnnouncementPrecursor::new(&peer_pk.kem_public_key);

        // get auth key
        let auth_key = agraphon_announcement_precursor.auth_key();

        // create initiation payload
        let _seeker_prefix_length: u8 = seeker_prefix
            .len()
            .try_into()
            .expect("Seeker prefix length too long");
        let session_init_payload = SessionInitPayload {
            seeker_prefix: seeker_prefix.to_vec(),
            unix_timestamp_millis: timestamp_millis,
        };
        let session_init_payload_bytes = bincode::serialize(&session_init_payload)
            .expect("Failed to serialize outgoing session initiation request");

        // create auth blob
        let auth_blob =
            auth::AuthBlob::new(our_pk.clone(), our_sk, session_init_payload_bytes, auth_key);
        let auth_payload_bytes =
            Zeroizing::new(bincode::serialize(&auth_blob).expect("Failed to serialize auth blob"));

        // finalize announcement
        let (announcement_bytes, announcement) =
            agraphon_announcement_precursor.finalize(auth_payload_bytes.as_slice());

        (announcement_bytes, Self {
            agraphon_announcement: announcement,
            timestamp_millis,
            seeker_prefix: seeker_prefix.to_vec(),
        })
    }
}

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct Session {
    agraphon_instance: crypto_agraphon::Agraphon,
    peer_public_keys: auth::UserPublicKeys,
    peer_seeker_prefix: Vec<u8>,
    self_seeker_prefix: Vec<u8>,
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
            peer_seeker_prefix: incoming_initiation_request.seeker_prefix.clone(),
            self_seeker_prefix: outgoing_initiation_request.seeker_prefix.clone(),
        }
    }

    fn combine_seeker(seeker_prefix: &[u8], seeker_postfix: &[u8]) -> Vec<u8> {
        let seeker_prefix_length: u8 = seeker_prefix
            .len()
            .try_into()
            .expect("Seeker prefix length too long");
        [
            &[seeker_prefix_length], // length-prefix avoids telescoping
            seeker_prefix,
            seeker_postfix,
        ]
        .concat()
    }

    /// Sends an outgoing message on the session and returns the seeker and the encrypted message bytes.
    pub fn send_outgoing_message(&mut self, message: &Message) -> SendOutgoingMessageOutput {
        let msg_bytes =
            Zeroizing::new(bincode::serialize(message).expect("Failed to serialize message"));
        let send_result = self
            .agraphon_instance
            .send_outgoing_message(&msg_bytes, &self.peer_public_keys.kem_public_key);
        let seeker = Self::combine_seeker(&self.self_seeker_prefix, send_result.seeker.as_slice());
        SendOutgoingMessageOutput {
            seeker,
            ciphertext: send_result.message_bytes.clone(),
        }
    }

    /// Gets the list of possible incoming message seekers.
    pub fn next_peer_message_seeker(&self) -> Vec<u8> {
        let seeker_postfix = Zeroizing::new(self.agraphon_instance.get_next_peer_message_seeker());
        Self::combine_seeker(&self.peer_seeker_prefix, seeker_postfix.as_slice())
    }

    pub fn try_feed_incoming_message(
        &mut self,
        self_static_sk: &auth::UserSecretKeys,
        message: &[u8],
    ) -> Option<FeedIncomingMessageOutput> {
        let raw_msg = self
            .agraphon_instance
            .try_feed_incoming_message(&self_static_sk.kem_secret_key, message)?;

        // deserialize the message
        let message: Message = bincode::deserialize(&raw_msg.message_bytes).ok()?;

        // convert seekers
        let newly_acknowledged_self_seekers = raw_msg
            .newly_acknowledged_self_seekers
            .iter()
            .map(|seeker| Self::combine_seeker(&self.self_seeker_prefix, seeker))
            .collect();

        Some(FeedIncomingMessageOutput {
            message,
            newly_acknowledged_self_seekers,
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
        let secondary_pub_key = [0u8; auth::SECONDARY_PUBLIC_KEY_SIZE];
        auth::derive_keys_from_static_root_secret(&root_secret, secondary_pub_key)
    }

    fn create_test_message(contents: &[u8]) -> Message {
        Message {
            timestamp: crate::utils::timestamp_millis(),
            contents: contents.to_vec(),
        }
    }

    #[test]
    fn test_message_creation() {
        let msg = create_test_message(b"test message");
        assert_eq!(msg.contents, b"test message");
        assert!(msg.timestamp > 0);
    }

    #[test]
    fn test_message_clone() {
        let msg = create_test_message(b"original");
        let cloned = msg.clone();
        assert_eq!(msg.timestamp, cloned.timestamp);
        assert_eq!(msg.contents, cloned.contents);
    }

    #[test]
    fn test_outgoing_initiation_request_creation() {
        let (our_pk, our_sk) = generate_test_keypair();
        let (peer_pk, _peer_sk) = generate_test_keypair();
        let seeker_prefix = b"test_prefix";
        let timestamp = crate::utils::timestamp_millis();

        let (announcement_bytes, outgoing_req) =
            OutgoingInitiationRequest::new(&our_pk, &our_sk, &peer_pk, seeker_prefix, timestamp);

        assert!(!announcement_bytes.is_empty());
        assert_eq!(outgoing_req.seeker_prefix, seeker_prefix);
        assert_eq!(outgoing_req.timestamp_millis, timestamp);
    }

    #[test]
    fn test_incoming_initiation_request_parsing() {
        let (our_pk, our_sk) = generate_test_keypair();
        let (peer_pk, peer_sk) = generate_test_keypair();
        let seeker_prefix = b"peer_to_us";
        let timestamp = crate::utils::timestamp_millis();

        // Create an outgoing request from peer's perspective
        let (announcement_bytes, _) =
            OutgoingInitiationRequest::new(&peer_pk, &peer_sk, &our_pk, seeker_prefix, timestamp);

        // Parse it as incoming from our perspective
        let incoming_req =
            IncomingInitiationRequest::try_from(&announcement_bytes, &our_pk, &our_sk);

        assert!(incoming_req.is_some());
        let incoming_req = incoming_req.unwrap();
        assert_eq!(incoming_req.seeker_prefix, seeker_prefix);
        assert_eq!(incoming_req.timestamp_millis, timestamp);
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
        let seeker_prefix = b"peer_to_someone_else";
        let timestamp = crate::utils::timestamp_millis();

        // Create an announcement for wrong_pk
        let (announcement_bytes, _) =
            OutgoingInitiationRequest::new(&peer_pk, &peer_sk, &wrong_pk, seeker_prefix, timestamp);

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

        let alice_seeker = b"alice_to_bob";
        let bob_seeker = b"bob_to_alice";
        let timestamp = crate::utils::timestamp_millis();

        // Alice creates outgoing request to Bob
        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk, alice_seeker, timestamp);

        // Bob creates outgoing request to Alice
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, bob_seeker, timestamp);

        // Alice receives Bob's announcement
        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk)
                .expect("Failed to parse Bob's announcement at Alice");

        // Bob receives Alice's announcement
        let alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk)
                .expect("Failed to parse Alice's announcement at Bob");

        // Both create sessions
        let alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);
        let bob_session =
            Session::from_initiation_request_pair(&bob_outgoing, &alice_incoming_at_bob);

        // Verify session properties
        assert_eq!(alice_session.self_seeker_prefix, alice_seeker);
        assert_eq!(alice_session.peer_seeker_prefix, bob_seeker);
        assert_eq!(bob_session.self_seeker_prefix, bob_seeker);
        assert_eq!(bob_session.peer_seeker_prefix, alice_seeker);
    }

    #[test]
    fn test_session_send_and_receive_message() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) = OutgoingInitiationRequest::new(
            &alice_pk,
            &alice_sk,
            &bob_pk,
            b"alice_to_bob",
            timestamp,
        );
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, b"bob_to_alice", timestamp);

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
        let send_output = alice_session.send_outgoing_message(&message);

        assert!(!send_output.seeker.is_empty());
        assert!(!send_output.ciphertext.is_empty());

        // Bob receives the message
        let receive_output = bob_session
            .try_feed_incoming_message(&bob_sk, &send_output.ciphertext)
            .expect("Failed to decrypt message");

        assert_eq!(receive_output.message.contents, b"Hello Bob!");
        assert_eq!(receive_output.message.timestamp, message.timestamp);
    }

    #[test]
    fn test_session_bidirectional_messaging() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) = OutgoingInitiationRequest::new(
            &alice_pk,
            &alice_sk,
            &bob_pk,
            b"alice_to_bob",
            timestamp,
        );
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, b"bob_to_alice", timestamp);

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
        let output1 = alice_session.send_outgoing_message(&msg1);
        let received1 = bob_session
            .try_feed_incoming_message(&bob_sk, &output1.ciphertext)
            .unwrap();
        assert_eq!(received1.message.contents, b"Hello Bob!");

        // Bob -> Alice
        let msg2 = create_test_message(b"Hi Alice!");
        let output2 = bob_session.send_outgoing_message(&msg2);
        let received2 = alice_session
            .try_feed_incoming_message(&alice_sk, &output2.ciphertext)
            .unwrap();
        assert_eq!(received2.message.contents, b"Hi Alice!");

        // Alice -> Bob (second message)
        let msg3 = create_test_message(b"How are you?");
        let output3 = alice_session.send_outgoing_message(&msg3);
        let received3 = bob_session
            .try_feed_incoming_message(&bob_sk, &output3.ciphertext)
            .unwrap();
        assert_eq!(received3.message.contents, b"How are you?");
    }

    #[test]
    fn test_session_wrong_recipient_cannot_decrypt() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();
        let (eve_pk, eve_sk) = generate_test_keypair();

        // Establish session between Alice and Bob
        let timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) = OutgoingInitiationRequest::new(
            &alice_pk,
            &alice_sk,
            &bob_pk,
            b"alice_to_bob",
            timestamp,
        );
        let (bob_announcement, _bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, b"bob_to_alice", timestamp);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let _alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();

        let mut alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);

        // Eve establishes her own session with Alice
        let (eve_announcement, eve_outgoing) =
            OutgoingInitiationRequest::new(&eve_pk, &eve_sk, &alice_pk, b"eve_to_alice", timestamp);
        let eve_incoming_at_alice =
            IncomingInitiationRequest::try_from(&eve_announcement, &alice_pk, &alice_sk).unwrap();
        let (alice_to_eve_announcement, _alice_to_eve_outgoing) = OutgoingInitiationRequest::new(
            &alice_pk,
            &alice_sk,
            &eve_pk,
            b"alice_to_eve",
            timestamp,
        );
        let _alice_incoming_at_eve =
            IncomingInitiationRequest::try_from(&alice_to_eve_announcement, &eve_pk, &eve_sk)
                .unwrap();
        let mut eve_session =
            Session::from_initiation_request_pair(&eve_outgoing, &eve_incoming_at_alice);

        // Alice sends message to Bob
        let message = create_test_message(b"Secret message for Bob");
        let send_output = alice_session.send_outgoing_message(&message);

        // Eve tries to decrypt (should fail)
        let eve_attempt = eve_session.try_feed_incoming_message(&eve_sk, &send_output.ciphertext);
        assert!(eve_attempt.is_none());
    }

    #[test]
    fn test_session_seeker_construction() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        let alice_prefix = b"alice_";
        let bob_prefix = b"bob_";
        let timestamp = crate::utils::timestamp_millis();

        let (alice_announcement, alice_outgoing) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk, alice_prefix, timestamp);
        let (bob_announcement, _bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, bob_prefix, timestamp);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let _alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();
        let alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);

        // Get seeker for next peer message
        let peer_seeker = alice_session.next_peer_message_seeker();

        // Seeker should start with length byte followed by bob's prefix
        assert!(peer_seeker.len() > bob_prefix.len());
        let prefix_len = peer_seeker[0] as usize;
        assert_eq!(prefix_len, bob_prefix.len());
        assert_eq!(&peer_seeker[1..1 + prefix_len], bob_prefix);
    }

    #[test]
    fn test_session_lag_length() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        let timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) = OutgoingInitiationRequest::new(
            &alice_pk,
            &alice_sk,
            &bob_pk,
            b"alice_to_bob",
            timestamp,
        );
        let (bob_announcement, _bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, b"bob_to_alice", timestamp);

        let bob_incoming_at_alice =
            IncomingInitiationRequest::try_from(&bob_announcement, &alice_pk, &alice_sk).unwrap();
        let _alice_incoming_at_bob =
            IncomingInitiationRequest::try_from(&alice_announcement, &bob_pk, &bob_sk).unwrap();
        let mut alice_session =
            Session::from_initiation_request_pair(&alice_outgoing, &bob_incoming_at_alice);

        // Get initial lag
        let initial_lag = alice_session.lag_length();

        // Send messages (lag increases without acknowledgments)
        alice_session.send_outgoing_message(&create_test_message(b"msg1"));
        let lag1 = alice_session.lag_length();
        assert!(lag1 > initial_lag);

        alice_session.send_outgoing_message(&create_test_message(b"msg2"));
        let lag2 = alice_session.lag_length();
        assert!(lag2 > lag1);
    }

    #[test]
    fn test_session_acknowledgments() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) = OutgoingInitiationRequest::new(
            &alice_pk,
            &alice_sk,
            &bob_pk,
            b"alice_to_bob",
            timestamp,
        );
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, b"bob_to_alice", timestamp);

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
        let output1 = alice_session.send_outgoing_message(&msg1);
        let msg2 = create_test_message(b"msg2");
        let _output2 = alice_session.send_outgoing_message(&msg2);

        // Bob receives first message
        let received1 = bob_session
            .try_feed_incoming_message(&bob_sk, &output1.ciphertext)
            .unwrap();
        assert_eq!(received1.message.contents, b"msg1");

        // Bob sends a reply (which acknowledges Alice's messages)
        let reply = create_test_message(b"reply");
        let reply_output = bob_session.send_outgoing_message(&reply);

        // Alice receives Bob's reply
        let received_reply = alice_session
            .try_feed_incoming_message(&alice_sk, &reply_output.ciphertext)
            .unwrap();
        assert_eq!(received_reply.message.contents, b"reply");

        // Check if there are newly acknowledged seekers
        assert!(!received_reply.newly_acknowledged_self_seekers.is_empty());
    }

    #[test]
    fn test_session_empty_message() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) = OutgoingInitiationRequest::new(
            &alice_pk,
            &alice_sk,
            &bob_pk,
            b"alice_to_bob",
            timestamp,
        );
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, b"bob_to_alice", timestamp);

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
        let send_output = alice_session.send_outgoing_message(&empty_message);

        let receive_output = bob_session
            .try_feed_incoming_message(&bob_sk, &send_output.ciphertext)
            .unwrap();

        assert!(receive_output.message.contents.is_empty());
    }

    #[test]
    fn test_session_large_message() {
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let timestamp = crate::utils::timestamp_millis();
        let (alice_announcement, alice_outgoing) = OutgoingInitiationRequest::new(
            &alice_pk,
            &alice_sk,
            &bob_pk,
            b"alice_to_bob",
            timestamp,
        );
        let (bob_announcement, bob_outgoing) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, b"bob_to_alice", timestamp);

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
        let send_output = alice_session.send_outgoing_message(&large_message);

        let receive_output = bob_session
            .try_feed_incoming_message(&bob_sk, &send_output.ciphertext)
            .unwrap();

        assert_eq!(receive_output.message.contents, large_content);
    }

    #[test]
    fn test_seeker_prefix_uniqueness() {
        // Test that different seeker prefixes result in different seekers
        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        let timestamp = crate::utils::timestamp_millis();

        // Create two sessions with different prefixes
        let (_ann1, out1) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk, b"prefix1", timestamp);
        let (bob_ann1, _bob_out1) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, b"bob1", timestamp);

        let (_ann2, out2) =
            OutgoingInitiationRequest::new(&alice_pk, &alice_sk, &bob_pk, b"prefix2", timestamp);
        let (bob_ann2, _bob_out2) =
            OutgoingInitiationRequest::new(&bob_pk, &bob_sk, &alice_pk, b"bob2", timestamp);

        let bob_in1 = IncomingInitiationRequest::try_from(&bob_ann1, &alice_pk, &alice_sk).unwrap();
        let bob_in2 = IncomingInitiationRequest::try_from(&bob_ann2, &alice_pk, &alice_sk).unwrap();

        let session1 = Session::from_initiation_request_pair(&out1, &bob_in1);
        let session2 = Session::from_initiation_request_pair(&out2, &bob_in2);

        let peer_seeker1 = session1.next_peer_message_seeker();
        let peer_seeker2 = session2.next_peer_message_seeker();

        // Seekers should be different due to different prefixes
        assert_ne!(peer_seeker1, peer_seeker2);
    }
}
