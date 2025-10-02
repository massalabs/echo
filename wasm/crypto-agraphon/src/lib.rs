//! # crypto-agraphon
//!
//! A secure, asynchronous messaging protocol implementation that provides forward + backward secrecy,
//! post-compromise security, and out-of-order message delivery.
//! It is based on KEM making it compatible with quantum-resistant algorithms.
//!
//! This crate implements a Double Ratchet-like protocol where parties can establish secure
//! sessions and exchange encrypted messages. The protocol supports:
//!
//! - **Forward Secrecy**: Past messages remain secure even if current keys are compromised
//! - **Post-Compromise Security**: Future messages are secure after key material is refreshed
//! - **Asynchronous Communication**: Messages can be sent without waiting for responses
//! - **Out-of-Order Delivery**: Messages can arrive in any order and still be decrypted
//!
//! ## ⚠️ Security Warnings
//!
//! ### Length Leakage
//!
//! **This protocol does NOT hide payload lengths.**
//!
//! The lengths of both the authentication payload in announcements and the message payloads
//! are leaked to potential observers. If length information could reveal sensitive details
//! about your application's communication patterns or message contents, you MUST pad your
//! payloads to a constant size (or use a padding scheme) before passing them to this crate.
//!
//! Without padding, an attacker can observe:
//! - The exact length of authentication data in the announcement phase
//! - The exact length of each message payload
//!
//! This information could potentially be used for traffic analysis attacks.
//!
//! ## Protocol Overview
//!
//! The protocol consists of two main phases:
//!
//! 1. **Announcement Phase**: Initial session establishment using static keys
//!    - Initiator creates an `OutgoingAnnouncementPrecursor` with the responder's public key
//!    - Responder processes it as an `IncomingAnnouncementPrecursor`
//!    - After mutual authentication, both parties have an `Agraphon` session
//!
//! 2. **Message Phase**: Ongoing encrypted communication
//!    - Each message uses ephemeral key encapsulation for forward secrecy
//!    - Session state ratchets forward with each message
//!    - Messages include a "seeker" to identify which message they're responding to
//!
//! ## Example Usage
//!
//! ```rust
//! use crypto_agraphon::{OutgoingAnnouncementPrecursor, IncomingAnnouncementPrecursor, Agraphon};
//! use crypto_kem as kem;
//! use crypto_rng as rng;
//!
//! // Generate key pairs for both parties
//! let mut alice_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
//! rng::fill_buffer(&mut alice_rand);
//! let (alice_sk, alice_pk) = kem::generate_key_pair(alice_rand);
//!
//! let mut bob_rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
//! rng::fill_buffer(&mut bob_rand);
//! let (bob_sk, bob_pk) = kem::generate_key_pair(bob_rand);
//!
//! // Alice initiates the session
//! let announcement_pre = OutgoingAnnouncementPrecursor::new(&bob_pk);
//! let auth_payload = b"Alice's authentication data";
//! let announcement = announcement_pre.finalize(auth_payload, &alice_pk);
//!
//! // Bob receives the announcement
//! let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
//!     announcement.announcement_bytes(),
//!     &bob_pk,
//!     &bob_sk,
//! ).expect("Failed to parse announcement");
//!
//! // After verifying auth_payload, Bob finalizes
//! let incoming = incoming_pre.finalize(alice_pk).expect("Integrity check failed");
//! let mut bob_session = Agraphon::try_from_incoming_announcement(incoming, &bob_pk)
//!     .expect("Failed to create session");
//!
//! // Alice creates her session
//! let mut alice_session = Agraphon::from_outgoing_announcement(announcement, bob_pk);
//!
//! // Now they can exchange messages
//! let (_seeker, message) = alice_session.send_outgoing_message(b"Hello, Bob!");
//! let decrypted = bob_session.try_feed_incoming_message(0, &bob_sk, &message)
//!     .expect("Failed to decrypt message");
//! assert_eq!(decrypted, b"Hello, Bob!");
//! ```

mod announcement_root_kdf;
mod history;
mod message_integrity_kdf;
mod message_root_kdf;
mod seeker_kdf;
mod static_kdf;
mod types;

mod agraphon;
mod announcement;

pub use agraphon::Agraphon;
pub use announcement::{
    IncomingAnnouncement, IncomingAnnouncementPrecursor, OutgoingAnnouncement,
    OutgoingAnnouncementPrecursor,
};
