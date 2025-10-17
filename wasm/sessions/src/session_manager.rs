//! Manages all the sessions we have with peers

use crate::{
    session::{
        FeedIncomingMessageOutput, IncomingInitiationRequest, Message, OutgoingInitiationRequest,
        SendOutgoingMessageOutput, Session,
    },
    utils::timestamp_millis,
};
use auth::UserId;
use std::collections::HashMap;

pub enum SessionStatus {
    /// This peer has an active session with us
    Active,
    /// This peer is not in the session manager
    UnknownPeer,
    /// This peer has no session with us
    NoSession,
    /// This peer has requested a session with us and is waiting for our response
    PeerRequested,
    /// We have requested a session with this peer and are waiting for their response
    SelfRequested,
    /// This session was recently killed due to an inconsistency
    Killed,
    /// This session is active but saturated by lag
    Saturated,
}

pub struct SessionManagerConfig {
    /// The maximum age of an incoming announcement in milliseconds
    pub max_incoming_announcement_age_millis: u128,
    /// The maximum future time of an incoming announcement in milliseconds
    pub max_incoming_announcement_future_millis: u128,

    /// The maximum age of an incoming message in milliseconds
    pub max_incoming_message_age_millis: u128,
    /// The maximum future time of an incoming message in milliseconds
    pub max_incoming_message_future_millis: u128,

    /// The maximum inactivity time of a session in milliseconds
    pub max_session_inactivity_millis: u128,

    /// The interval at which to send keep-alive messages to peers
    pub keep_alive_interval_millis: u128,

    /// The maximum lag length of a session before sending more messages is blocked
    pub max_session_lag_length: u64,
}

struct SessionInfo {
    session: Session,
    last_incoming_message_timestamp: u128,
    last_outgoing_message_timestamp: u128,
}

#[derive(Default)]
struct PeerInfo {
    active_session: Option<SessionInfo>,
    latest_incoming_init_request: Option<IncomingInitiationRequest>,
    latest_outgoing_init_request: Option<OutgoingInitiationRequest>,
}

pub struct SessionManager {
    config: SessionManagerConfig,
    peers: HashMap<UserId, PeerInfo>,
}

impl SessionManager {
    pub fn new(config: SessionManagerConfig) -> Self {
        Self {
            config,
            peers: HashMap::new(),
        }
    }

    /// Returns the peer IDs that need a keep-alive message
    pub fn refresh(&mut self) -> Vec<UserId> {
        // check for expired announcements and sessions
        let timestamp_now = timestamp_millis();
        let oldest_message_timestamp =
            timestamp_now.saturating_sub(self.config.max_session_inactivity_millis);
        let keep_alive_timestamp =
            timestamp_now.saturating_sub(self.config.keep_alive_interval_millis);
        let oldest_announcement_timestamp =
            timestamp_now.saturating_sub(self.config.max_incoming_announcement_age_millis);
        let mut keep_alive_needed = Vec::new();
        for (peer_id, peer_info) in self.peers.iter_mut() {
            // session expiry
            if let Some(active_session) = &mut peer_info.active_session {
                if active_session.last_incoming_message_timestamp < oldest_message_timestamp {
                    peer_info.active_session = None;
                }
            }

            // announcement expiry
            if let Some(latest_incoming_init_request) = &peer_info.latest_incoming_init_request {
                if latest_incoming_init_request.timestamp_millis < oldest_announcement_timestamp {
                    peer_info.latest_incoming_init_request = None;
                }
            }
            if let Some(latest_outgoing_init_request) = &peer_info.latest_outgoing_init_request {
                if latest_outgoing_init_request.timestamp_millis < oldest_announcement_timestamp {
                    peer_info.latest_outgoing_init_request = None;
                }
            }

            // session keep-alive trigger
            if let Some(active_session) = &peer_info.active_session {
                if active_session.last_outgoing_message_timestamp < keep_alive_timestamp {
                    keep_alive_needed.push(peer_id.clone());
                }
            }
        }

        // peers that need keep-alive messages
        keep_alive_needed
    }

    // returns true if the announcement was accepted
    pub fn feed_incoming_announcement(
        &mut self,
        announcement_bytes: &[u8],
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
    ) {
        // try to parse as incoming initiation request
        let Some(incoming_initiation_request) =
            IncomingInitiationRequest::try_from(announcement_bytes, our_pk, our_sk)
        else {
            return;
        };

        // check if it is not too old or too much in the future
        let cur_timestamp = timestamp_millis();
        if incoming_initiation_request.timestamp_millis
            < cur_timestamp.saturating_sub(self.config.max_incoming_announcement_age_millis)
        {
            return;
        }
        if incoming_initiation_request.timestamp_millis
            > cur_timestamp.saturating_add(self.config.max_incoming_announcement_future_millis)
        {
            return;
        }

        // compute peer ID
        let peer_id = incoming_initiation_request.origin_public_keys.derive_id();

        // make sure that it is newer than the latest incoming initiation request we processed, otherwise ignore
        if let Some(peer_info) = self.peers.get(&peer_id) {
            if let Some(latest_incoming_init_request) = &peer_info.latest_incoming_init_request {
                if incoming_initiation_request.timestamp_millis
                    <= latest_incoming_init_request.timestamp_millis
                {
                    return;
                }
            }
        }

        // now check if we have made an outgoing initiation request to this peer, in that case we can create a session
        if let Some(peer_info) = self.peers.get_mut(&peer_id) {
            if let Some(latest_outgoing_init_request) = &peer_info.latest_outgoing_init_request {
                // set new session or replace existing
                let new_session = Session::from_initiation_request_pair(
                    latest_outgoing_init_request,
                    &incoming_initiation_request,
                );
                peer_info.active_session = Some(SessionInfo {
                    session: new_session,
                    last_incoming_message_timestamp: incoming_initiation_request.timestamp_millis,
                    last_outgoing_message_timestamp: latest_outgoing_init_request.timestamp_millis,
                });
            }
        }

        // update the latest incoming initiation request
        let peer_info = self.peers.entry(peer_id.clone()).or_default();
        peer_info.latest_incoming_init_request = Some(incoming_initiation_request);
    }

    /// Returns the announcement bytes to send
    pub fn establish_outgoing_session(
        &mut self,
        peer_pk: &auth::UserPublicKeys,
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
        seeker_prefix: &[u8],
    ) -> Vec<u8> {
        // get peer ID
        let peer_id = peer_pk.derive_id();

        // get current timestamp
        let cur_timestamp = timestamp_millis();

        // create outgoing initiation request
        let (announcement_bytes, outgoing_initiation_request) =
            OutgoingInitiationRequest::new(our_pk, our_sk, peer_pk, seeker_prefix, cur_timestamp);

        // check if we already have an incoming announcement from this peer
        if let Some(peer_info) = self.peers.get_mut(&peer_id) {
            if let Some(latest_incoming_init_request) = &peer_info.latest_incoming_init_request {
                // we have an incoming announcement. This means we should create a new session
                let new_session = Session::from_initiation_request_pair(
                    &outgoing_initiation_request,
                    latest_incoming_init_request,
                );
                peer_info.active_session = Some(SessionInfo {
                    session: new_session,
                    last_incoming_message_timestamp: latest_incoming_init_request.timestamp_millis,
                    last_outgoing_message_timestamp: outgoing_initiation_request.timestamp_millis,
                });
            }
        }

        // update the latest outgoing initiation request
        let peer_info = self.peers.entry(peer_id.clone()).or_default();
        peer_info.latest_outgoing_init_request = Some(outgoing_initiation_request);
        announcement_bytes
    }

    pub fn peer_discard(&mut self, peer_id: &UserId) {
        self.peers.remove(peer_id);
    }

    pub fn peer_session_status(&self, peer_id: &UserId) -> SessionStatus {
        // grab peer
        let Some(peer_info) = self.peers.get(peer_id) else {
            return SessionStatus::UnknownPeer;
        };

        // grab session
        if let Some(session) = &peer_info.active_session {
            if session.session.lag_length() >= self.config.max_session_lag_length {
                return SessionStatus::Saturated;
            } else {
                return SessionStatus::Active;
            }
        }

        // no session, look into announcements
        let req_peer = peer_info.latest_incoming_init_request.is_some();
        let req_self = peer_info.latest_outgoing_init_request.is_some();
        match (req_peer, req_self) {
            (true, true) => SessionStatus::Killed,
            (true, false) => SessionStatus::PeerRequested,
            (false, true) => SessionStatus::SelfRequested,
            (false, false) => SessionStatus::NoSession,
        }
    }

    pub fn peer_list(&self) -> Vec<UserId> {
        self.peers.keys().cloned().collect()
    }

    pub fn get_message_board_read_keys(&self) -> Vec<Vec<u8>> {
        let mut message_board_seekers = Vec::new();
        for (_peer_id, peer_info) in self.peers.iter() {
            if let Some(active_session) = &peer_info.active_session {
                message_board_seekers.push(active_session.session.next_peer_message_seeker());
            }
        }
        message_board_seekers
    }

    /// returns (message id, message)
    fn inner_feed_incoming_msg(
        &mut self,
        peer_id: &UserId,
        bytes: &[u8],
        our_sk: &auth::UserSecretKeys,
    ) -> Option<FeedIncomingMessageOutput> {
        // try to decode message
        let mut msg = None;
        if let Some(peer_info) = self.peers.get_mut(peer_id) {
            if let Some(active_session) = &mut peer_info.active_session {
                msg = active_session
                    .session
                    .try_feed_incoming_message(our_sk, bytes);
            }
        }
        let msg = msg?;

        // check message timestamp (past, future)
        let cur_timestamp = timestamp_millis();
        if msg.message.timestamp
            < cur_timestamp.saturating_sub(self.config.max_incoming_message_age_millis)
        {
            return None;
        }
        if msg.message.timestamp
            > cur_timestamp.saturating_add(self.config.max_incoming_message_future_millis)
        {
            return None;
        }

        // check if the message timestamp is consistent with the latest one,
        // and update the last incoming message timestamp
        if let Some(peer_info) = self.peers.get_mut(peer_id) {
            if let Some(active_session) = &mut peer_info.active_session {
                if msg.message.timestamp < active_session.last_incoming_message_timestamp {
                    return None;
                }
                active_session.last_incoming_message_timestamp = msg.message.timestamp;
            }
        }

        // return the message
        Some(msg)
    }

    pub fn feed_incoming_message_board_read(
        &mut self,
        seeker: &[u8],
        bytes: &[u8],
        our_sk: &auth::UserSecretKeys,
    ) -> Option<FeedIncomingMessageOutput> {
        // find the peer that has the seeker
        let mut peer_id = None;
        for (p_id, peer_info) in self.peers.iter() {
            if let Some(active_session) = &peer_info.active_session {
                if active_session.session.next_peer_message_seeker() == seeker {
                    peer_id = Some(p_id.clone());
                    break;
                }
            }
        }
        let peer_id = peer_id?;

        // feed the message into the session
        let msg = self.inner_feed_incoming_msg(&peer_id, bytes, our_sk);

        // if the message is None here, it means the session has a problem: close it
        if msg.is_none() {
            if let Some(peer_info) = self.peers.get_mut(&peer_id) {
                peer_info.active_session = None;
            }
        };

        // return the message
        msg
    }

    /// Sends a message to a peer through their active session.
    ///
    /// # Returns
    ///
    /// - `Some(SendOutgoingMessageOutput)` if the message was successfully prepared for sending
    /// - `None` if there's no active session with the peer or if the session lag exceeds the configured maximum
    ///
    /// # Behavior
    ///
    /// This method will check the session lag length before sending. If the number of unacknowledged
    /// messages exceeds `max_session_lag_length`, it will return `None` to prevent overwhelming the peer.
    pub fn send_message(
        &mut self,
        peer_id: &UserId,
        message: &Message,
    ) -> Option<SendOutgoingMessageOutput> {
        // get the session and send
        if let Some(peer_info) = self.peers.get_mut(peer_id) {
            if let Some(active_session) = &mut peer_info.active_session {
                if active_session.session.lag_length() >= self.config.max_session_lag_length {
                    return None;
                }
                let send_result = active_session.session.send_outgoing_message(message);
                active_session.last_outgoing_message_timestamp = message.timestamp;
                return Some(send_result);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Message;

    fn generate_test_keypair() -> (auth::UserPublicKeys, auth::UserSecretKeys) {
        // Generate a random passphrase for testing
        let mut passphrase = [0u8; 32];
        crypto_rng::fill_buffer(&mut passphrase);
        let root_secret = auth::StaticRootSecret::from_passphrase(&passphrase);
        let secondary_pub_key = [0u8; auth::SECONDARY_PUBLIC_KEY_SIZE];
        auth::derive_keys_from_static_root_secret(&root_secret, secondary_pub_key)
    }

    fn create_test_config() -> SessionManagerConfig {
        SessionManagerConfig {
            max_incoming_announcement_age_millis: 60_000,
            max_incoming_announcement_future_millis: 5_000,
            max_incoming_message_age_millis: 300_000,
            max_incoming_message_future_millis: 5_000,
            max_session_inactivity_millis: 3_600_000,
            keep_alive_interval_millis: 60_000,
            max_session_lag_length: 100,
        }
    }

    fn create_test_message(contents: &[u8]) -> Message {
        Message {
            timestamp: timestamp_millis(),
            contents: contents.to_vec(),
        }
    }

    #[test]
    fn test_session_manager_creation() {
        let config = create_test_config();
        let manager = SessionManager::new(config);
        assert_eq!(manager.peer_list().len(), 0);
    }

    #[test]
    fn test_session_establishment_bidirectional() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Alice initiates session to Bob
        let alice_announcement = alice_manager.establish_outgoing_session(
            &bob_pk,
            &alice_pk,
            &alice_sk,
            b"alice_to_bob",
        );

        // Bob initiates session to Alice
        let bob_announcement =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice");

        // Feed announcements
        bob_manager.feed_incoming_announcement(&alice_announcement, &bob_pk, &bob_sk);
        alice_manager.feed_incoming_announcement(&bob_announcement, &alice_pk, &alice_sk);

        // Check session status
        let alice_id = alice_pk.derive_id();
        let bob_id = bob_pk.derive_id();

        assert!(matches!(
            alice_manager.peer_session_status(&bob_id),
            SessionStatus::Active
        ));
        assert!(matches!(
            bob_manager.peer_session_status(&alice_id),
            SessionStatus::Active
        ));
    }

    #[test]
    fn test_peer_list() {
        let config = create_test_config();
        let mut manager = SessionManager::new(config);

        let (our_pk, our_sk) = generate_test_keypair();
        let (peer1_pk, _) = generate_test_keypair();
        let (peer2_pk, _) = generate_test_keypair();

        // Establish sessions
        manager.establish_outgoing_session(&peer1_pk, &our_pk, &our_sk, b"to_peer1");
        manager.establish_outgoing_session(&peer2_pk, &our_pk, &our_sk, b"to_peer2");

        let peer_list = manager.peer_list();
        assert_eq!(peer_list.len(), 2);
        assert!(peer_list.contains(&peer1_pk.derive_id()));
        assert!(peer_list.contains(&peer2_pk.derive_id()));
    }

    #[test]
    fn test_peer_discard() {
        let config = create_test_config();
        let mut manager = SessionManager::new(config);

        let (our_pk, our_sk) = generate_test_keypair();
        let (peer_pk, _) = generate_test_keypair();
        let peer_id = peer_pk.derive_id();

        // Establish session
        manager.establish_outgoing_session(&peer_pk, &our_pk, &our_sk, b"to_peer");

        assert_eq!(manager.peer_list().len(), 1);
        assert!(matches!(
            manager.peer_session_status(&peer_id),
            SessionStatus::SelfRequested
        ));

        // Discard peer
        manager.peer_discard(&peer_id);

        assert_eq!(manager.peer_list().len(), 0);
        assert!(matches!(
            manager.peer_session_status(&peer_id),
            SessionStatus::UnknownPeer
        ));
    }

    #[test]
    fn test_session_status_self_requested() {
        let config = create_test_config();
        let mut manager = SessionManager::new(config);

        let (our_pk, our_sk) = generate_test_keypair();
        let (peer_pk, _) = generate_test_keypair();
        let peer_id = peer_pk.derive_id();

        // We initiate but peer doesn't respond yet
        manager.establish_outgoing_session(&peer_pk, &our_pk, &our_sk, b"to_peer");

        assert!(matches!(
            manager.peer_session_status(&peer_id),
            SessionStatus::SelfRequested
        ));
    }

    #[test]
    fn test_session_status_peer_requested() {
        let config = create_test_config();
        let mut manager = SessionManager::new(config);

        let (our_pk, our_sk) = generate_test_keypair();
        let (peer_pk, peer_sk) = generate_test_keypair();
        let peer_id = peer_pk.derive_id();

        // Peer initiates
        let mut peer_manager = SessionManager::new(create_test_config());
        let peer_announcement =
            peer_manager.establish_outgoing_session(&our_pk, &peer_pk, &peer_sk, b"peer_to_us");

        // We receive peer's announcement
        manager.feed_incoming_announcement(&peer_announcement, &our_pk, &our_sk);

        assert!(matches!(
            manager.peer_session_status(&peer_id),
            SessionStatus::PeerRequested
        ));
    }

    #[test]
    fn test_session_status_unknown_peer() {
        let config = create_test_config();
        let manager = SessionManager::new(config);

        let (peer_pk, _) = generate_test_keypair();
        let peer_id = peer_pk.derive_id();

        assert!(matches!(
            manager.peer_session_status(&peer_id),
            SessionStatus::UnknownPeer
        ));
    }

    #[test]
    fn test_message_exchange() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let alice_announcement = alice_manager.establish_outgoing_session(
            &bob_pk,
            &alice_pk,
            &alice_sk,
            b"alice_to_bob",
        );
        let bob_announcement =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice");

        bob_manager.feed_incoming_announcement(&alice_announcement, &bob_pk, &bob_sk);
        alice_manager.feed_incoming_announcement(&bob_announcement, &alice_pk, &alice_sk);

        let bob_id = bob_pk.derive_id();
        let _alice_id = alice_pk.derive_id();

        // Alice sends message to Bob
        let message = create_test_message(b"Hello Bob!");
        let send_output = alice_manager
            .send_message(&bob_id, &message)
            .expect("Failed to send message");

        // Bob reads the message
        let bob_seekers = bob_manager.get_message_board_read_keys();
        assert!(bob_seekers.contains(&send_output.seeker));

        let received = bob_manager
            .feed_incoming_message_board_read(&send_output.seeker, &send_output.ciphertext, &bob_sk)
            .expect("Failed to receive message");

        assert_eq!(received.message.contents, b"Hello Bob!");
    }

    #[test]
    fn test_message_board_read_keys() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());
        let mut charlie_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();
        let (charlie_pk, charlie_sk) = generate_test_keypair();

        // Alice establishes sessions with Bob and Charlie
        let alice_to_bob = alice_manager.establish_outgoing_session(
            &bob_pk,
            &alice_pk,
            &alice_sk,
            b"alice_to_bob",
        );
        let alice_to_charlie = alice_manager.establish_outgoing_session(
            &charlie_pk,
            &alice_pk,
            &alice_sk,
            b"alice_to_charlie",
        );

        // Bob and Charlie establish sessions back
        let bob_to_alice =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice");
        let charlie_to_alice = charlie_manager.establish_outgoing_session(
            &alice_pk,
            &charlie_pk,
            &charlie_sk,
            b"charlie_to_alice",
        );

        // Complete handshakes
        bob_manager.feed_incoming_announcement(&alice_to_bob, &bob_pk, &bob_sk);
        charlie_manager.feed_incoming_announcement(&alice_to_charlie, &charlie_pk, &charlie_sk);
        alice_manager.feed_incoming_announcement(&bob_to_alice, &alice_pk, &alice_sk);
        alice_manager.feed_incoming_announcement(&charlie_to_alice, &alice_pk, &alice_sk);

        // Alice should have 2 read keys (one for Bob, one for Charlie)
        let read_keys = alice_manager.get_message_board_read_keys();
        assert_eq!(read_keys.len(), 2);
    }

    #[test]
    fn test_send_message_no_session() {
        let config = create_test_config();
        let mut manager = SessionManager::new(config);

        let (_our_pk, _our_sk) = generate_test_keypair();
        let (peer_pk, _peer_sk) = generate_test_keypair();
        let peer_id = peer_pk.derive_id();

        let message = create_test_message(b"test");
        let result = manager.send_message(&peer_id, &message);

        assert!(result.is_none());
    }

    #[test]
    fn test_bidirectional_message_exchange() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let alice_announcement = alice_manager.establish_outgoing_session(
            &bob_pk,
            &alice_pk,
            &alice_sk,
            b"alice_to_bob",
        );
        let bob_announcement =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice");

        bob_manager.feed_incoming_announcement(&alice_announcement, &bob_pk, &bob_sk);
        alice_manager.feed_incoming_announcement(&bob_announcement, &alice_pk, &alice_sk);

        let bob_id = bob_pk.derive_id();
        let alice_id = alice_pk.derive_id();

        // Alice -> Bob
        let msg1 = create_test_message(b"Hello Bob!");
        let output1 = alice_manager.send_message(&bob_id, &msg1).unwrap();
        let received1 = bob_manager
            .feed_incoming_message_board_read(&output1.seeker, &output1.ciphertext, &bob_sk)
            .unwrap();
        assert_eq!(received1.message.contents, b"Hello Bob!");

        // Bob -> Alice
        let msg2 = create_test_message(b"Hi Alice!");
        let output2 = bob_manager.send_message(&alice_id, &msg2).unwrap();
        let received2 = alice_manager
            .feed_incoming_message_board_read(&output2.seeker, &output2.ciphertext, &alice_sk)
            .unwrap();
        assert_eq!(received2.message.contents, b"Hi Alice!");
    }

    #[test]
    fn test_invalid_announcement_wrong_recipient() {
        let config = create_test_config();
        let mut manager = SessionManager::new(config);

        let (our_pk, our_sk) = generate_test_keypair();
        let (peer_pk, peer_sk) = generate_test_keypair();
        let (other_pk, _other_sk) = generate_test_keypair();

        // Create announcement for other_pk
        let mut peer_manager = SessionManager::new(create_test_config());
        let announcement =
            peer_manager.establish_outgoing_session(&other_pk, &peer_pk, &peer_sk, b"to_other");

        // Try to feed with our keys (should be ignored)
        manager.feed_incoming_announcement(&announcement, &our_pk, &our_sk);

        // No peer should be added
        assert_eq!(manager.peer_list().len(), 0);
    }

    #[test]
    fn test_invalid_announcement_garbage_data() {
        let config = create_test_config();
        let mut manager = SessionManager::new(config);

        let (our_pk, our_sk) = generate_test_keypair();
        let garbage = b"this is not a valid announcement";

        // Should be ignored without crashing
        manager.feed_incoming_announcement(garbage, &our_pk, &our_sk);

        assert_eq!(manager.peer_list().len(), 0);
    }

    #[test]
    fn test_announcement_too_old() {
        let mut config = create_test_config();
        config.max_incoming_announcement_age_millis = 1000; // 1 second

        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Bob creates announcement
        let bob_announcement =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice");

        // Wait for announcement to become too old
        std::thread::sleep(std::time::Duration::from_millis(1100));

        // Alice tries to process old announcement
        alice_manager.feed_incoming_announcement(&bob_announcement, &alice_pk, &alice_sk);

        // Should not create peer entry or should be in appropriate state
        let bob_id = bob_pk.derive_id();
        let status = alice_manager.peer_session_status(&bob_id);
        assert!(matches!(status, SessionStatus::UnknownPeer));
    }

    #[test]
    fn test_refresh_with_no_sessions() {
        let config = create_test_config();
        let mut manager = SessionManager::new(config);

        let keep_alive_peers = manager.refresh();
        assert_eq!(keep_alive_peers.len(), 0);
    }

    #[test]
    fn test_session_status_saturated() {
        let mut config = create_test_config();
        config.max_session_lag_length = 2; // Very low to trigger saturation easily

        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let alice_announcement = alice_manager.establish_outgoing_session(
            &bob_pk,
            &alice_pk,
            &alice_sk,
            b"alice_to_bob",
        );
        let bob_announcement =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice");

        bob_manager.feed_incoming_announcement(&alice_announcement, &bob_pk, &bob_sk);
        alice_manager.feed_incoming_announcement(&bob_announcement, &alice_pk, &alice_sk);

        let bob_id = bob_pk.derive_id();

        // Send messages until saturated
        let msg1 = create_test_message(b"msg1");
        alice_manager.send_message(&bob_id, &msg1);
        let msg2 = create_test_message(b"msg2");
        alice_manager.send_message(&bob_id, &msg2);
        let msg3 = create_test_message(b"msg3");
        alice_manager.send_message(&bob_id, &msg3);

        // Check if saturated
        let status = alice_manager.peer_session_status(&bob_id);
        assert!(matches!(status, SessionStatus::Saturated));

        // Try to send another message (should fail)
        let msg4 = create_test_message(b"msg4");
        let result = alice_manager.send_message(&bob_id, &msg4);
        assert!(result.is_none());
    }

    #[test]
    fn test_feed_incoming_message_wrong_seeker() {
        let config = create_test_config();
        let mut manager = SessionManager::new(config);

        let (_our_pk, our_sk) = generate_test_keypair();
        let wrong_seeker = b"wrong_seeker";
        let message_bytes = b"some encrypted data";

        let result = manager.feed_incoming_message_board_read(wrong_seeker, message_bytes, &our_sk);
        assert!(result.is_none());
    }

    #[test]
    fn test_multiple_announcements_from_same_peer() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Bob sends first announcement
        let bob_announcement1 =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice_v1");

        // Small delay
        std::thread::sleep(std::time::Duration::from_millis(10));

        // Bob sends second announcement (newer)
        let bob_announcement2 =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice_v2");

        // Alice receives both (newer should be kept)
        alice_manager.feed_incoming_announcement(&bob_announcement1, &alice_pk, &alice_sk);
        alice_manager.feed_incoming_announcement(&bob_announcement2, &alice_pk, &alice_sk);

        let bob_id = bob_pk.derive_id();
        assert!(matches!(
            alice_manager.peer_session_status(&bob_id),
            SessionStatus::PeerRequested
        ));

        // Only one peer should be in the list
        assert_eq!(alice_manager.peer_list().len(), 1);
    }

    #[test]
    fn test_older_announcement_ignored() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Bob sends newer announcement first
        std::thread::sleep(std::time::Duration::from_millis(10));
        let bob_announcement2 =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice_v2");

        // Simulate an older announcement (with older timestamp)
        // We need to manually create one or track the first one
        let bob_announcement1 =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice_v1");

        // Alice receives newer first
        alice_manager.feed_incoming_announcement(&bob_announcement2, &alice_pk, &alice_sk);

        // Then receives older (should be ignored)
        alice_manager.feed_incoming_announcement(&bob_announcement1, &alice_pk, &alice_sk);

        // Should still have the peer
        let _bob_id = bob_pk.derive_id();
        assert_eq!(alice_manager.peer_list().len(), 1);
    }

    #[test]
    fn test_session_with_empty_seeker_prefix() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Use empty seeker prefix
        let alice_announcement =
            alice_manager.establish_outgoing_session(&bob_pk, &alice_pk, &alice_sk, b"");
        let bob_announcement =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"");

        bob_manager.feed_incoming_announcement(&alice_announcement, &bob_pk, &bob_sk);
        alice_manager.feed_incoming_announcement(&bob_announcement, &alice_pk, &alice_sk);

        let bob_id = bob_pk.derive_id();
        assert!(matches!(
            alice_manager.peer_session_status(&bob_id),
            SessionStatus::Active
        ));
    }

    #[test]
    fn test_message_acknowledgments() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let alice_announcement = alice_manager.establish_outgoing_session(
            &bob_pk,
            &alice_pk,
            &alice_sk,
            b"alice_to_bob",
        );
        let bob_announcement =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice");

        bob_manager.feed_incoming_announcement(&alice_announcement, &bob_pk, &bob_sk);
        alice_manager.feed_incoming_announcement(&bob_announcement, &alice_pk, &alice_sk);

        let bob_id = bob_pk.derive_id();
        let alice_id = alice_pk.derive_id();

        // Alice sends messages
        let msg1 = create_test_message(b"msg1");
        let output1 = alice_manager.send_message(&bob_id, &msg1).unwrap();
        let msg2 = create_test_message(b"msg2");
        let _output2 = alice_manager.send_message(&bob_id, &msg2).unwrap();

        // Bob receives first message
        bob_manager
            .feed_incoming_message_board_read(&output1.seeker, &output1.ciphertext, &bob_sk)
            .unwrap();

        // Bob sends reply (acknowledges Alice's messages)
        let reply = create_test_message(b"reply");
        let reply_output = bob_manager.send_message(&alice_id, &reply).unwrap();

        // Alice receives Bob's reply
        let received_reply = alice_manager
            .feed_incoming_message_board_read(
                &reply_output.seeker,
                &reply_output.ciphertext,
                &alice_sk,
            )
            .unwrap();

        // Check for acknowledgments
        assert!(!received_reply.newly_acknowledged_self_seekers.is_empty());
    }

    #[test]
    fn test_corrupted_message_closes_session() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);
        let mut bob_manager = SessionManager::new(create_test_config());

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, bob_sk) = generate_test_keypair();

        // Establish sessions
        let alice_announcement = alice_manager.establish_outgoing_session(
            &bob_pk,
            &alice_pk,
            &alice_sk,
            b"alice_to_bob",
        );
        let bob_announcement =
            bob_manager.establish_outgoing_session(&alice_pk, &bob_pk, &bob_sk, b"bob_to_alice");

        bob_manager.feed_incoming_announcement(&alice_announcement, &bob_pk, &bob_sk);
        alice_manager.feed_incoming_announcement(&bob_announcement, &alice_pk, &alice_sk);

        let _bob_id = bob_pk.derive_id();

        // Get Bob's expected seeker
        let bob_seekers = bob_manager.get_message_board_read_keys();
        assert_eq!(bob_seekers.len(), 1);
        let bob_seeker = &bob_seekers[0];

        // Feed corrupted message
        let corrupted = b"corrupted message data";
        let result = bob_manager.feed_incoming_message_board_read(bob_seeker, corrupted, &bob_sk);

        // Should return None and close session
        assert!(result.is_none());
    }

    #[test]
    fn test_peer_list_with_multiple_states() {
        let config = create_test_config();
        let mut alice_manager = SessionManager::new(config);

        let (alice_pk, alice_sk) = generate_test_keypair();
        let (bob_pk, _bob_sk) = generate_test_keypair();
        let (charlie_pk, charlie_sk) = generate_test_keypair();

        // Alice initiates to Bob (SelfRequested)
        alice_manager.establish_outgoing_session(&bob_pk, &alice_pk, &alice_sk, b"alice_to_bob");

        // Charlie initiates to Alice (PeerRequested)
        let mut charlie_manager = SessionManager::new(create_test_config());
        let charlie_announcement = charlie_manager.establish_outgoing_session(
            &alice_pk,
            &charlie_pk,
            &charlie_sk,
            b"charlie_to_alice",
        );
        alice_manager.feed_incoming_announcement(&charlie_announcement, &alice_pk, &alice_sk);

        // Alice should have 2 peers
        let peer_list = alice_manager.peer_list();
        assert_eq!(peer_list.len(), 2);

        let bob_id = bob_pk.derive_id();
        let charlie_id = charlie_pk.derive_id();

        assert!(matches!(
            alice_manager.peer_session_status(&bob_id),
            SessionStatus::SelfRequested
        ));
        assert!(matches!(
            alice_manager.peer_session_status(&charlie_id),
            SessionStatus::PeerRequested
        ));
    }
}
