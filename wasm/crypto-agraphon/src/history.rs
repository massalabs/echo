//! Message history tracking for asynchronous communication.
//!
//! This module maintains the state needed to support out-of-order message delivery.
//! Each party tracks their own sent messages and the peer's most recent message.

use crate::static_kdf::StaticKdf;
use crate::types::KeySource;
use crypto_kem as kem;
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

const MASTER_KEY_SIZE: usize = 32;

/// History item representing one of our sent messages.
///
/// When we send a message, we store this information so we can later decrypt
/// the peer's response to that specific message. This enables asynchronous
/// communication where messages can be sent and received in any order.
///
/// # Fields
///
/// - `local_id`: Sequential identifier for our sent messages
/// - `sk_next`: The secret key to use for decrypting responses to this message
/// - `mk_next`: Master key derived after sending this message
/// - `seeker_next`: Seeker seed for identifying responses to this message
///
/// # Protocol Context
///
/// We maintain a queue of recent sent messages. When receiving a message from
/// the peer, we compute seekers for each item in this queue to determine which
/// of our messages they're responding to.
#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub(crate) struct HistoryItemSelf {
    /// Sequential local identifier for this message
    pub(crate) local_id: u64,
    /// Secret key for decrypting responses (Static or Ephemeral)
    pub(crate) sk_next: KeySource<kem::SecretKey>,
    /// Master key derived after sending this message
    pub(crate) mk_next: [u8; MASTER_KEY_SIZE],
    /// Seeker seed for message identification
    pub(crate) seeker_next: [u8; 32],
}

impl HistoryItemSelf {
    /// Creates the initial history item from our static public key.
    ///
    /// This represents the "virtual" message with ID 0 that exists before
    /// any actual messages are sent. It uses the static public key to derive
    /// initial key material.
    ///
    /// # Arguments
    ///
    /// * `static_pk_self` - Our static (long-term) public key
    ///
    /// # Returns
    ///
    /// A `HistoryItemSelf` with `local_id` 0 and keys derived from the static key.
    pub fn initial(static_pk_self: &kem::PublicKey) -> Self {
        let static_kem = StaticKdf::new(static_pk_self);
        Self {
            local_id: 0,
            sk_next: KeySource::Static,
            mk_next: static_kem.mk_next,
            seeker_next: static_kem.seeker_next,
        }
    }
}

/// History item representing the peer's most recent message.
///
/// We only need to track the peer's latest message (not their entire history)
/// because we always respond to their most recent communication.
///
/// # Fields
///
/// - `our_parent_id`: Which of our messages they were responding to
/// - `pk_next`: Their next public key (for us to encapsulate to)
/// - `mk_next`: Their master key after this message
/// - `seeker_next`: Their seeker seed for future message identification
///
/// # Protocol Context
///
/// When the peer sends a message:
/// 1. They include which of our messages they're responding to (`our_parent_id`)
/// 2. They include their next public key (`pk_next`)
/// 3. We update this structure with their new state
/// 4. We can delete our history items older than `our_parent_id` (they've been acknowledged)
#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub(crate) struct HistoryItemPeer {
    /// Which of our messages they were responding to
    pub(crate) our_parent_id: u64,
    /// Their next public key for us to encapsulate to
    pub(crate) pk_next: kem::PublicKey,
    /// Their master key after this message
    pub(crate) mk_next: [u8; MASTER_KEY_SIZE],
    /// Their seeker seed for message identification
    pub(crate) seeker_next: [u8; 32],
}

impl HistoryItemPeer {
    /// Creates the initial peer history item from their static public key.
    ///
    /// This represents the peer's initial state before any messages are received.
    /// It uses their static public key to derive initial key material.
    ///
    /// # Arguments
    ///
    /// * `static_pk_peer` - The peer's static (long-term) public key
    ///
    /// # Returns
    ///
    /// A `HistoryItemPeer` with `our_parent_id` 0 and keys derived from their static key.
    pub fn initial(static_pk_peer: kem::PublicKey) -> Self {
        let static_kem = StaticKdf::new(&static_pk_peer);
        Self {
            our_parent_id: 0,
            pk_next: static_pk_peer,
            mk_next: static_kem.mk_next,
            seeker_next: static_kem.seeker_next,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto_rng as rng;

    #[test]
    fn test_history_item_self_initial() {
        let mut rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut rand);
        let (_, pk) = kem::generate_key_pair(rand);

        let item = HistoryItemSelf::initial(&pk);

        assert_eq!(item.local_id, 0);
        assert!(matches!(item.sk_next, KeySource::Static));
    }

    #[test]
    fn test_history_item_peer_initial() {
        let mut rand = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut rand);
        let (_, pk) = kem::generate_key_pair(rand);

        let pk_bytes = pk.as_bytes().clone();
        let item = HistoryItemPeer::initial(pk);

        assert_eq!(item.our_parent_id, 0);
        assert_eq!(item.pk_next.as_bytes(), &pk_bytes);
    }
}
