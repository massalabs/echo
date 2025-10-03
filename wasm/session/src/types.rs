use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// A unique identifier for a session
#[derive(
    Debug,
    Clone,
    Hash,
    Serialize,
    Deserialize,
    Zeroize,
    ZeroizeOnDrop,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
)]
pub struct SessionId([u8; 32]);

impl SessionId {
    /// Creates a new random SessionId
    pub fn new() -> Self {
        let mut id = [0u8; 32];
        crypto_rng::fill_buffer(&mut id);
        Self(id)
    }

    /// Creates a SessionId from a byte array
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Returns the underlying byte array
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}
