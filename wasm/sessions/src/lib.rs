//! Sessions crate
//!
//! This crate provides a session manager enabling post-quantum perfect forward/backward secrecy messaging.
//! It supports sealed blockchain seekers and sealed metadata through integration with the agraphon
//! cryptographic protocol.
//!
//! # Overview
//!
//! The `sessions` crate manages bidirectional encrypted communication channels between peers in a
//! blockchain-based messaging system. Each session is established through a handshake protocol that
//! exchanges announcements, after which messages can be sent and received with strong security guarantees.
//!
//! Key features:
//! - **Post-quantum security**: Uses ML-KEM for key encapsulation
//! - **Perfect forward secrecy**: Past messages remain secure even if future keys are compromised
//! - **Perfect backward secrecy**: Future messages remain secure even if past keys are compromised
//! - **Sealed seekers**: Message board lookups don't reveal sender/receiver identities
//! - **Session lifecycle management**: Automatic expiry, keep-alive, and lag control
//! - **Concurrent sessions**: Manage multiple peer sessions simultaneously
//!
//! # Security
//!
//! This crate builds on several cryptographic primitives to provide strong security guarantees:
//!
//! ## Cryptographic Foundations
//!
//! - **Key Encapsulation**: ML-KEM-768 (NIST FIPS 203) provides post-quantum secure key exchange
//! - **Digital Signatures**: ML-DSA-65 (NIST FIPS 204) authenticates announcements and prevents impersonation
//! - **Authenticated Encryption**: AES-256-GCM protects message confidentiality and integrity
//! - **Key Derivation**: BLAKE3 derives session keys from shared secrets
//!
//! ## Security Properties
//!
//! - **Authentication**: All announcements are signed with ML-DSA-65, preventing impersonation attacks
//! - **Forward Secrecy**: Each message uses ephemeral keys derived through the agraphon protocol,
//!   so compromise of long-term keys doesn't reveal past messages
//! - **Backward Secrecy**: Key material is ratcheted forward and old keys are zeroized, preventing
//!   future message decryption even if current state is compromised
//! - **Sealed Metadata**: Message board seekers are derived from shared secrets, hiding communication
//!   patterns from network observers
//! - **Replay Protection**: Timestamps and sequence numbers prevent message replay attacks
//! - **Post-Quantum Resistance**: All key exchange uses ML-KEM, resistant to quantum computer attacks
//!
//! ## Threat Model
//!
//! The session manager protects against:
//! - Passive network observers (traffic analysis resistance through sealed seekers)
//! - Active attackers attempting impersonation (authentication via signatures)
//! - Compromised long-term keys in the past (forward secrecy)
//! - Compromised session state (backward secrecy through key ratcheting)
//! - Quantum adversaries (post-quantum cryptography)
//! - Message replay and reordering attacks
//!
//! ## Security Considerations
//!
//! - **Clock Synchronization**: The timestamp validation relies on reasonably synchronized clocks.
//!   Configure `max_incoming_announcement_future_millis` and `max_incoming_message_future_millis`
//!   based on expected clock drift.
//! - **Denial of Service**: The `max_session_lag_length` configuration prevents memory exhaustion
//!   from unacknowledged messages.
//! - **Session Expiry**: Configure `max_session_inactivity_millis` appropriately to balance security
//!   (shorter = less time for attacks) vs usability (longer = fewer re-establishments).
//! - **Key Material**: All sensitive key material uses `zeroize` to clear memory on drop.
//!
//! # Architecture
//!
//! ```text
//!                          SessionManager
//!                                |
//!                 +--------------+---------------+
//!                 |                              |
//!            PeerInfo 1                     PeerInfo 2
//!                 |                              |
//!         +-------+-------+              +-------+-------+
//!         |       |       |              |       |       |
//!      Session  InReq  OutReq         Session  InReq  OutReq
//! ```
//!
//! - **SessionManager**: Orchestrates all peer sessions, handles announcements, routes messages
//! - **PeerInfo**: Tracks session state and pending initiation requests for each peer
//! - **Session**: Manages the agraphon protocol instance and message encryption/decryption
//! - **IncomingInitiationRequest**: Parsed announcement from a peer wanting to establish a session
//! - **OutgoingInitiationRequest**: Our announcement to a peer to establish a session
//!
//! # Usage
//!
//! ## Basic Example
//!
//! ```rust,no_run
//! use sessions::{SessionManager, SessionManagerConfig};
//! use auth::{UserPublicKeys, UserSecretKeys, UserId};
//!
//! // Initialize your identity
//! let (our_pk, our_sk) = auth::generate_user_keypair();
//!
//! // Configure the session manager
//! let config = SessionManagerConfig {
//!     max_incoming_announcement_age_millis: 60_000,      // 1 minute
//!     max_incoming_announcement_future_millis: 5_000,     // 5 seconds
//!     max_incoming_message_age_millis: 300_000,           // 5 minutes
//!     max_incoming_message_future_millis: 5_000,          // 5 seconds
//!     max_session_inactivity_millis: 3_600_000,           // 1 hour
//!     keep_alive_interval_millis: 60_000,                 // 1 minute
//!     max_session_lag_length: 100,                        // max unacknowledged messages
//! };
//!
//! let mut session_manager = SessionManager::new(config);
//!
//! // Establish a session with a peer
//! let peer_pk: UserPublicKeys = get_peer_public_keys();
//! let seeker_prefix = b"alice_to_bob_";
//! let announcement = session_manager.establish_outgoing_session(
//!     &peer_pk,
//!     &our_pk,
//!     &our_sk,
//!     seeker_prefix
//! );
//! // Publish `announcement` to the blockchain announcement board
//!
//! // Main event loop
//! loop {
//!     // 1. Process incoming announcements from the blockchain
//!     for announcement_bytes in fetch_new_announcements() {
//!         session_manager.feed_incoming_announcement(
//!             &announcement_bytes,
//!             &our_pk,
//!             &our_sk
//!         );
//!     }
//!
//!     // 2. Get seekers to monitor on the message board
//!     let seekers = session_manager.get_message_board_read_keys();
//!     
//!     // 3. Check for incoming messages using those seekers
//!     for seeker in seekers {
//!         if let Some(message_bytes) = blockchain_read(&seeker) {
//!             if let Some(msg_output) = session_manager.feed_incoming_message_board_read(
//!                 &seeker,
//!                 &message_bytes,
//!                 &our_sk
//!             ) {
//!                 // Successfully decrypted a message
//!                 println!("Received: {:?}", msg_output.message.contents);
//!                 
//!                 // Handle newly acknowledged seekers (for garbage collection)
//!                 for ack_seeker in msg_output.newly_acknowledged_self_seekers {
//!                     blockchain_mark_seeker_as_read(&ack_seeker);
//!                 }
//!             }
//!         }
//!     }
//!
//!     // 4. Send outgoing messages
//!     let peer_id: UserId = peer_pk.derive_id();
//!     let message = Message {
//!         timestamp: current_time_millis(),
//!         contents: b"Hello, peer!".to_vec(),
//!     };
//!     if let Some(output) = session_manager.send_message(&peer_id, &message) {
//!         // Publish to blockchain message board
//!         blockchain_write(&output.seeker, &output.ciphertext);
//!     }
//!
//!     // 5. Refresh sessions and send keep-alive messages
//!     let keep_alive_peers = session_manager.refresh();
//!     for peer_id in keep_alive_peers {
//!         let keep_alive_msg = Message {
//!             timestamp: current_time_millis(),
//!             contents: vec![],  // Empty message for keep-alive
//!         };
//!         if let Some(output) = session_manager.send_message(&peer_id, &keep_alive_msg) {
//!             blockchain_write(&output.seeker, &output.ciphertext);
//!         }
//!     }
//!
//!     // 6. Check session statuses
//!     for peer_id in session_manager.peer_list() {
//!         match session_manager.peer_session_status(&peer_id) {
//!             SessionStatus::Active => { /* Session is healthy */ },
//!             SessionStatus::Saturated => { /* Too much lag, wait for acks */ },
//!             SessionStatus::PeerRequested => {
//!                 // Peer wants session, respond with our announcement
//!                 let announcement = session_manager.establish_outgoing_session(
//!                     &get_peer_pk(&peer_id),
//!                     &our_pk,
//!                     &our_sk,
//!                     &generate_seeker_prefix(&peer_id)
//!                 );
//!                 blockchain_publish_announcement(&announcement);
//!             },
//!             _ => { /* Handle other states */ },
//!         }
//!     }
//!
//!     std::thread::sleep(std::time::Duration::from_secs(1));
//! }
//!
//! # fn get_peer_public_keys() -> UserPublicKeys { todo!() }
//! # fn fetch_new_announcements() -> Vec<Vec<u8>> { vec![] }
//! # fn blockchain_read(seeker: &[u8]) -> Option<Vec<u8>> { None }
//! # fn blockchain_write(seeker: &[u8], data: &[u8]) {}
//! # fn blockchain_mark_seeker_as_read(seeker: &[u8]) {}
//! # fn current_time_millis() -> u128 { 0 }
//! # fn get_peer_pk(peer_id: &UserId) -> UserPublicKeys { todo!() }
//! # fn generate_seeker_prefix(peer_id: &UserId) -> Vec<u8> { vec![] }
//! # fn blockchain_publish_announcement(ann: &[u8]) {}
//! # use sessions::SessionStatus;
//! # use sessions::Message;
//! ```
//!
//! ## Session Lifecycle
//!
//! 1. **Initiation**: Either peer calls `establish_outgoing_session()` and publishes the announcement
//! 2. **Handshake**: When both peers have sent announcements, `feed_incoming_announcement()` creates the session
//! 3. **Active Communication**: Use `send_message()` and `feed_incoming_message_board_read()` to exchange messages
//! 4. **Keep-Alive**: Call `refresh()` periodically and send keep-alive messages to prevent expiry
//! 5. **Termination**: Sessions expire after `max_session_inactivity_millis` of inactivity, or can be manually
//!    closed with `peer_discard()`

mod session;
mod session_manager;
mod utils;

pub use session::{FeedIncomingMessageOutput, Message, SendOutgoingMessageOutput};
pub use session_manager::{SessionManager, SessionManagerConfig, SessionStatus};
