//! Internal types used throughout the crypto-agraphon crate.

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Represents the role of a party in the protocol.
///
/// The role determines how key derivation and message processing occur.
/// Each session has one Initiator (who sends the first announcement) and
/// one Responder (who receives the first announcement).
///
/// # Example Usage (internal)
///
/// ```text
/// let role = Role::Initiator;
/// assert_eq!(role.to_bytes(), [0]);
/// assert_eq!(role.opposite(), Role::Responder);
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub(crate) enum Role {
    /// The party who initiates the session by sending the first announcement
    Initiator,
    /// The party who responds to the announcement
    Responder,
}

impl Role {
    /// Converts the role to a byte representation for use in key derivation.
    ///
    /// # Returns
    ///
    /// - `[0]` for `Initiator`
    /// - `[1]` for `Responder`
    pub(crate) fn as_bytes(&self) -> &[u8; 1] {
        match self {
            Role::Initiator => &[0],
            Role::Responder => &[1],
        }
    }

    /// Returns the opposite role.
    ///
    /// This is used when processing received messages, as the sender's role
    /// is the opposite of the receiver's role.
    ///
    /// # Example Usage (internal)
    ///
    /// ```text
    /// assert_eq!(Role::Initiator.opposite(), Role::Responder);
    /// assert_eq!(Role::Responder.opposite(), Role::Initiator);
    /// ```
    pub(crate) fn opposite(&self) -> Self {
        match self {
            Role::Initiator => Role::Responder,
            Role::Responder => Role::Initiator,
        }
    }
}

/// Indicates whether a secret key is ephemeral or static.
///
/// This is used in the message history to track whether the next expected message
/// should be decrypted with an ephemeral key (generated for a specific message)
/// or the static long-term key.
///
/// # Type Parameters
///
/// - `T`: The type of the ephemeral key (typically `kem::SecretKey`)
#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub(crate) enum KeySource<T: ZeroizeOnDrop> {
    /// An ephemeral key generated for a specific message
    Ephemeral(T),
    /// The static long-term secret key should be used
    Static,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_role_to_bytes() {
        assert_eq!(Role::Initiator.as_bytes(), &[0]);
        assert_eq!(Role::Responder.as_bytes(), &[1]);
    }

    #[test]
    fn test_role_opposite() {
        assert_eq!(Role::Initiator.opposite(), Role::Responder);
        assert_eq!(Role::Responder.opposite(), Role::Initiator);
        // Test that opposite is involutive (applying it twice gives back the original)
        assert_eq!(Role::Initiator.opposite().opposite(), Role::Initiator);
        assert_eq!(Role::Responder.opposite().opposite(), Role::Responder);
    }
}
