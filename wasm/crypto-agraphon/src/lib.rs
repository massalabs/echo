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
//! ### Memory Zeroization
//!
//! **Best-effort zeroization requires a secure environment.**
//!
//! This crate makes best efforts to securely zeroize sensitive cryptographic material from
//! memory when it's no longer needed. All sensitive types implement `Zeroize` and `ZeroizeOnDrop`,
//! and intermediate buffers containing sensitive data are wrapped in `Zeroizing<T>`.
//!
//! However, zeroization at the application level cannot guarantee complete protection against
//! all memory disclosure attacks. Additional system-level protections are strongly recommended:
//!
//! - **Use a zeroizing allocator** that clears memory on deallocation
//! - **Disable swap/paging** for processes handling sensitive data
//! - **Use memory protection** features (e.g., `mlock`/`madvise` on Unix, `VirtualLock` on Windows)
//! - **Protect against core dumps** that could expose memory contents
//! - **Be aware of compiler optimizations** that may eliminate "dead" zeroization code
//!
//! Note: Rust's standard allocator does not zero memory on deallocation. Memory reallocations
//! (e.g., Vec growth) may leave copies of sensitive data in old memory regions, though this
//! crate uses boxing and careful buffer management to minimize such risks.
//!
//! ### Constant-Time Operations
//!
//! **Timing side-channels are hardware and platform dependent.**
//!
//! This crate makes best efforts to use constant-time operations where timing side-channels
//! could leak sensitive information. Notably:
//!
//! - Cryptographic comparisons use `subtle::ConstantTimeEq`
//! - The underlying cryptographic primitives (ML-KEM, AES-CTR, HKDF) are designed for
//!   constant-time operation
//!
//! However, true constant-time execution depends heavily on:
//!
//! - **CPU microarchitecture**: Cache timing, speculative execution, and other CPU features
//!   can leak timing information even from "constant-time" code
//! - **Compiler optimizations**: The compiler may transform code in ways that introduce
//!   timing variations
//! - **Operating system behavior**: Context switches, interrupts, and scheduler decisions
//!   affect timing measurements
//!
//! For high-security applications facing sophisticated attackers with physical access or
//! the ability to perform high-precision timing measurements:
//!
//! - Run in a controlled environment with minimal interference
//! - Consider hardware-based protections against side-channel attacks
//! - Validate on your specific platform that timing variations are acceptable
//!
//! ### Operating System Randomness
//!
//! **This crate depends critically on secure OS-provided randomness.**
//!
//! All cryptographic key generation, nonces, and random values use the operating system's
//! cryptographically secure random number generator (CSPRNG) via the `crypto_rng` crate.
//! The security of this protocol is **fundamentally dependent** on the quality of this randomness.
//!
//! Requirements:
//!
//! - **Sufficient entropy at startup**: Ensure the OS CSPRNG is properly seeded before using
//!   this crate. On Linux, this means `/dev/urandom` has been initialized with sufficient entropy.
//! - **Secure RNG implementation**: The OS must provide a cryptographically secure RNG. This
//!   crate uses platform-specific sources:
//!   - Linux: `getrandom()` syscall or `/dev/urandom`
//!   - Windows: `BCryptGenRandom`
//!   - macOS/iOS: `SecRandomCopyBytes`
//!   - WebAssembly: `crypto.getRandomValues()` (browser) or Node.js `crypto`
//!
//! Failure conditions:
//!
//! - If the OS RNG is compromised or predictable, **all security guarantees are void**
//! - In virtualized or embedded environments, ensure proper entropy sources are available
//! - In early boot scenarios, wait for sufficient entropy before generating keys
//!
//! This crate will panic if randomness cannot be obtained from the OS.
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
//! let (announcement_bytes, announcement) = announcement_pre.finalize(auth_payload, &alice_pk);
//!
//! // Bob receives the announcement
//! let incoming_pre = IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
//!     &announcement_bytes,
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
