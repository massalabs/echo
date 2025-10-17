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
}

pub struct SessionManagerConfig {
    pub max_incoming_announcement_age_millis: u128,
    pub max_incoming_announcement_future_millis: u128,

    pub max_incoming_message_age_millis: u128,
    pub max_incoming_message_future_millis: u128,

    pub max_session_inactivity_millis: u128,
    pub keep_alive_interval_millis: u128,

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
        if peer_info.active_session.is_some() {
            return SessionStatus::Active;
        };

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
