//! Manages all the sessions we have with peers

use std::collections::{BTreeSet, HashMap};

use crate::{SessionId, session::Session, utils::timestamp_millis};
use auth::UserId;

pub struct SessionManagerConfig {
    pub max_incoming_announcement_age_millis: u128,
    pub max_closed_session_age_millis: u128, // make this a bit bigger than max_incoming_announcement_age_millis
}

struct SessionInfo {
    session_id: SessionId,
    session: Session,
}

struct PeerInfo {
    // (timestmap, session ID) closed session history
    closed_sessions: BTreeSet<(u128, SessionId)>,

    session_from: Option<SessionInfo>,
    session_to: Option<SessionInfo>,
}

impl PeerInfo {
    fn add_closed_session(&mut self, session: &Session, max_closed_session_age_millis: u128) {
        let timestamp = timestamp_millis();
        self.closed_sessions.insert((
            session.init_info.unix_timestamp_millis,
            session.init_info.session_id.clone(),
        ));

        // cleanup old closed sessions
        while let Some((session_ts, _)) = self.closed_sessions.first() {
            if *session_ts < timestamp.saturating_sub(max_closed_session_age_millis) {
                self.closed_sessions.pop_first();
            } else {
                break;
            }
        }
    }
}

pub struct SessionManager {
    config: SessionManagerConfig,
    peers: HashMap<UserId, Box<PeerInfo>>,
}

impl SessionManager {
    pub fn new(config: SessionManagerConfig) -> Self {
        Self {
            config,
            peers: HashMap::new(),
        }
    }

    pub fn feed_incoming_announcement(
        &mut self,
        announcement_bytes: &[u8],
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
    ) {
        let cur_timestamp = timestamp_millis();

        // try to create a session from the announcement
        let Some((session, peer_pk)) = Session::try_incoming(announcement_bytes, our_pk, our_sk)
        else {
            // invalid announcement
            return;
        };

        // derive peer id
        let peer_id = peer_pk.derive_id();

        // replay protection: check announcement timestamp
        if cur_timestamp.saturating_sub(session.init_info.unix_timestamp_millis)
            > self.config.max_incoming_announcement_age_millis
        {
            // announcement is too old, it was likely replayed
            return;
        }

        // replay protection: session ID uniqueness
        if let Some(peer_info) = self.peers.get(&peer_id) {
            // check if the session ID is in the closed session history
            if peer_info.closed_sessions.contains(&(
                session.init_info.unix_timestamp_millis,
                session.init_info.session_id.clone(),
            )) {
                // this session ID was closed before: it was likely replayed
                return;
            }

            if let Some(ref session_from) = peer_info.session_from {
                if session_from.session_id == session.init_info.session_id {
                    // we have already seen this session ID: it was likely replayed
                    return;
                }
            }
        }

        // get or create peer info
        let peer_info = self.peers.entry(peer_id.clone()).or_insert_with(|| {
            Box::new(PeerInfo {
                closed_sessions: BTreeSet::new(),
                session_from: None,
                session_to: None,
            })
        });

        // check if we already have a newer session from this peer
        if let Some(session_from) = &peer_info.session_from {
            if session.init_info.unix_timestamp_millis
                <= session_from.session.init_info.unix_timestamp_millis
            {
                peer_info.add_closed_session(&session, self.config.max_closed_session_age_millis);
                return;
            }
        }

        // update the current session from this peer
        let session_id = session.init_info.session_id.clone();
        if let Some(prev_session) = peer_info.session_from.take() {
            peer_info.add_closed_session(
                &prev_session.session,
                self.config.max_closed_session_age_millis,
            );
        }
        peer_info.session_from = Some(SessionInfo {
            session_id: session_id,
            session: session,
        });
        //TODO: there might still be available messages to read from the previous session,
        // for now they will be dropped.
        // TODO: there is an issue with multi-device usage
    }

    pub fn initiate_outgoing_session(
        &mut self,
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
        peer_pk: &auth::UserPublicKeys,
    ) -> Vec<u8> {
        // derive peer id
        let peer_id = peer_pk.derive_id();

        // create session
        let (session, announcement_bytes) = Session::new_outgoing(our_pk, our_sk, peer_pk);

        // check if we already have an outgoing session to this peer
        let peer_info = self.peers.entry(peer_id.clone()).or_insert_with(|| {
            Box::new(PeerInfo {
                closed_sessions: BTreeSet::new(),
                session_from: None,
                session_to: None,
            })
        });

        if let Some(prev_session) = peer_info.session_to.take() {
            peer_info.add_closed_session(
                &prev_session.session,
                self.config.max_closed_session_age_millis,
            );
        }

        peer_info.session_to = Some(SessionInfo {
            session_id: session.init_info.session_id.clone(),
            session: session,
        });

        // TODO: the peer might still be sending messages to the previous session, which might get lost.
        // we need to figure out multiple session handling

        announcement_bytes
    }

    pub fn possible_incoming_message_seekers(&self) -> Vec<((UserId, SessionId, u64), [u8; 32])> {
        let mut res = Vec::new();
        for (peer_id, peer_info) in self.peers.iter() {
            // check if we have an incoming session from this peer
            if let Some(session_from) = &peer_info.session_from {
                let seekers = session_from.session.possible_incoming_message_seekers();
                for (seeker_id, seeker) in seekers {
                    res.push((
                        (peer_id.clone(), session_from.session_id.clone(), seeker_id),
                        seeker,
                    ));
                }
            }
            // check if we have an outgoing session to this peer
            if let Some(session_to) = &peer_info.session_to {
                let seekers = session_to.session.possible_incoming_message_seekers();
                for (seeker_id, seeker) in seekers {
                    res.push((
                        (peer_id.clone(), session_to.session_id.clone(), seeker_id),
                        seeker,
                    ));
                }
            }
        }
        res
    }

    pub fn send_message(
        &mut self,
        _peer_id: &UserId,
        _message: &[u8],
    ) -> Option<([u8; 32], Vec<u8>)> {

        /*
        TODO:
            first, get the best session to use with that peer. If none is available, return None
            then, send the message on that session. Return the seeker value and the encrypted announcement data to post on the public board
        */
        None
    }

    pub fn feed_incoming_message(
        &mut self,
        _peer_id: &UserId,
        _session_id: &SessionId,
        _seeker_id: u64,
        _message: &[u8],
    ) -> Option<Vec<u8>> {
        /*
        TODO
        */
        None
    }
}
