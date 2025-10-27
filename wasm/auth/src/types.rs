//! Core authentication types for user key management.
//!
//! This module provides the fundamental types for managing user authentication keys
//! in a hierarchical key derivation scheme. All user keys are derived from a single
//! root secret, ensuring deterministic key generation.

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

/// Size of the user ID in bytes.
pub const USER_ID_SIZE: usize = 32;

/// Size of the static root secret in bytes.
pub const STATIC_ROOT_SECRET_SIZE: usize = 32;

/// Size of the secondary public key in bytes.
pub const SECONDARY_PUBLIC_KEY_SIZE: usize = 32;

/// Size of the secondary secret key in bytes.
pub const SECONDARY_SECRET_KEY_SIZE: usize = 32;

/// A unique identifier for a user, derived from their public keys.
///
/// The user ID is deterministically computed from all public keys using a KDF,
/// ensuring that the same key material always produces the same ID.
#[derive(Debug, Clone, Hash, Zeroize, ZeroizeOnDrop, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserId([u8; USER_ID_SIZE]);

impl UserId {
    /// Returns the user ID as a byte slice.
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    /// Creates a `UserId` from a byte array.
    #[must_use]
    pub const fn from_bytes(bytes: [u8; USER_ID_SIZE]) -> Self {
        Self(bytes)
    }
}

impl AsRef<[u8]> for UserId {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// A collection of all public keys associated with a user.
///
/// This structure contains four different types of public keys:
/// - DSA verification key for digital signatures
/// - KEM public key for key encapsulation
/// - Massa blockchain public key
/// - Secondary public key for additional purposes
#[derive(Clone, Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct UserPublicKeys {
    /// Digital Signature Algorithm verification key.
    pub dsa_verification_key: crypto_dsa::VerificationKey,
    /// Key Encapsulation Mechanism public key.
    pub kem_public_key: crypto_kem::PublicKey,
    /// Massa blockchain public key.
    #[zeroize(skip)] // TODO: add zeroization to massa pubkeys
    pub massa_public_key: massa_signature::PublicKey,
    /// Secondary public key for additional authentication purposes.
    pub secondary_public_key: [u8; SECONDARY_PUBLIC_KEY_SIZE],
}

impl UserPublicKeys {
    /// Derives a unique user ID from the public keys.
    ///
    /// The ID is computed by:
    /// 1. Extracting entropy from all four public keys using a KDF
    /// 2. Expanding the extracted entropy into a 32-byte user ID
    ///
    /// This ensures that the user ID is:
    /// - Deterministic (same keys always produce the same ID)
    /// - Unique (different key combinations produce different IDs)
    /// - One-way (cannot reverse engineer keys from the ID)
    ///
    /// # Returns
    ///
    /// A `UserId` uniquely identifying this set of public keys.
    #[must_use]
    pub fn derive_id(&self) -> UserId {
        let massa_public_key_bytes = Zeroizing::new(self.massa_public_key.to_bytes());

        let mut kdf = crypto_kdf::Extract::new(b"auth.id.kdf.salt----------------");
        kdf.input_item(self.dsa_verification_key.as_bytes());
        kdf.input_item(self.kem_public_key.as_bytes());
        kdf.input_item(&massa_public_key_bytes);
        kdf.input_item(&self.secondary_public_key);
        let expander = kdf.finalize();

        let mut id = [0u8; USER_ID_SIZE];
        expander.expand(b"auth.id.kdf.id", &mut id);
        UserId(id)
    }
}

/// A root secret from which all user keys are derived.
///
/// The static root secret is the foundation of the key hierarchy. It is typically
/// derived from a user's passphrase using a password-based KDF. All user keys
/// are deterministically derived from this root secret.
///
/// # Security
///
/// This type is marked with `ZeroizeOnDrop` to ensure the secret is securely
/// erased from memory when the value is dropped.
#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct StaticRootSecret([u8; STATIC_ROOT_SECRET_SIZE]);

impl StaticRootSecret {
    /// Returns the root secret as a byte slice.
    #[must_use]
    pub const fn as_slice(&self) -> &[u8] {
        &self.0
    }

    /// Derives a static root secret from a passphrase.
    ///
    /// Uses a password-based key derivation function to convert a user's passphrase
    /// into a 32-byte root secret. The derivation is deterministic, so the same
    /// passphrase will always produce the same root secret.
    ///
    /// # Arguments
    ///
    /// * `passphrase` - The user's passphrase as a byte slice
    ///
    /// # Returns
    ///
    /// A `StaticRootSecret` derived from the passphrase.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let passphrase = b"my secure passphrase";
    /// let root_secret = StaticRootSecret::from_passphrase(passphrase);
    /// ```
    #[must_use]
    pub fn from_passphrase(passphrase: &[u8]) -> Self {
        let mut output = [0u8; STATIC_ROOT_SECRET_SIZE];
        crypto_password_kdf::derive(passphrase, b"auth.pwd.kdf.salt---------------", &mut output);
        Self(output)
    }

    /// Creates a `StaticRootSecret` from raw bytes.
    ///
    /// # Arguments
    ///
    /// * `bytes` - A 32-byte array containing the root secret
    ///
    /// # Returns
    ///
    /// A `StaticRootSecret` wrapping the provided bytes.
    #[must_use]
    pub const fn from_bytes(bytes: [u8; STATIC_ROOT_SECRET_SIZE]) -> Self {
        Self(bytes)
    }
}

/// A collection of all secret keys associated with a user.
///
/// This structure contains four different types of secret keys that correspond
/// to the public keys in `UserPublicKeys`. All keys in this structure are
/// zeroized when dropped to prevent memory leakage of sensitive data.
#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct UserSecretKeys {
    /// Digital Signature Algorithm signing key.
    pub dsa_signing_key: crypto_dsa::SigningKey,
    /// Key Encapsulation Mechanism secret key.
    pub kem_secret_key: crypto_kem::SecretKey,
    /// Massa blockchain keypair.
    #[zeroize(skip)] // TODO: add zeroization to massa keypair
    pub massa_keypair: massa_signature::KeyPair,
    /// Secondary secret key for additional authentication purposes.
    pub secondary_secret_key: [u8; SECONDARY_SECRET_KEY_SIZE],
}

/// Derives all user keys from a static root secret.
///
/// This function implements a hierarchical deterministic key derivation scheme.
/// Given a root secret and a secondary public key, it derives:
/// - DSA signing/verification keypair
/// - KEM secret/public keypair
/// - Massa blockchain keypair
/// - Secondary secret key
///
/// The derivation is deterministic, meaning the same inputs will always produce
/// the same output keys. This allows users to recover their keys from their
/// passphrase.
///
/// # Arguments
///
/// * `static_root_secret` - The root secret from which to derive keys
/// * `secondary_public_key` - The secondary public key to include in the public keys
///
/// # Returns
///
/// A tuple containing:
/// - `UserPublicKeys` - All derived public keys
/// - `UserSecretKeys` - All derived secret keys
///
/// # Panics
///
/// Panics if the derived Massa keypair bytes are invalid. In practice, this should
/// never happen as the KDF output is always valid key material.
///
/// # Example
///
/// ```ignore
/// use auth::{StaticRootSecret, derive_keys_from_static_root_secret};
///
/// let passphrase = b"my secure passphrase";
/// let root_secret = StaticRootSecret::from_passphrase(passphrase);
/// let secondary_pub_key = [0u8; 32]; // In practice, use a real key
///
/// let (public_keys, secret_keys) = derive_keys_from_static_root_secret(
///     &root_secret,
///     secondary_pub_key
/// );
/// ```
#[must_use]
pub fn derive_keys_from_static_root_secret(
    static_root_secret: &StaticRootSecret,
    secondary_public_key: [u8; SECONDARY_PUBLIC_KEY_SIZE],
) -> (UserPublicKeys, UserSecretKeys) {
    // Extract entropy from the root secret
    let mut kdf = crypto_kdf::Extract::new(b"auth.keypairs.kdf.salt----------");
    kdf.input_item(static_root_secret.as_slice());
    let expander = kdf.finalize();

    // Derive randomness for DSA key generation
    let mut dsa_randomness = [0u8; crypto_dsa::KEY_GENERATION_RANDOMNESS_SIZE];
    expander.expand(b"auth.keypairs.kdf.dsa_randomness", &mut dsa_randomness);

    // Derive randomness for KEM key generation
    let mut kem_randomness = [0u8; crypto_kem::KEY_GENERATION_RANDOMNESS_SIZE];
    expander.expand(b"auth.keypairs.kdf.kem_randomness", &mut kem_randomness);

    // Derive Massa keypair bytes (33 bytes, first byte is version)
    let mut massa_keypair_bytes = Zeroizing::new([0u8; 33]);
    expander.expand(
        "auth.keypairs.kdf.massa_keypair_bytes".as_bytes(),
        &mut massa_keypair_bytes[1..],
    );

    // Derive secondary secret key
    let mut secondary_secret_key = [0u8; SECONDARY_SECRET_KEY_SIZE];
    expander.expand(
        b"auth.keypairs.kdf.secondary_key",
        &mut secondary_secret_key,
    );

    // Generate keypairs from derived randomness
    let (dsa_signing_key, dsa_verification_key) = crypto_dsa::generate_key_pair(dsa_randomness);
    let (kem_secret_key, kem_public_key) = crypto_kem::generate_key_pair(kem_randomness);

    let massa_keypair = massa_signature::KeyPair::from_bytes(massa_keypair_bytes.as_slice())
        .expect("Invalid massa keypair bytes");
    let massa_public_key = massa_keypair.get_public_key();

    (
        UserPublicKeys {
            dsa_verification_key,
            kem_public_key,
            massa_public_key,
            secondary_public_key,
        },
        UserSecretKeys {
            dsa_signing_key,
            kem_secret_key,
            massa_keypair,
            secondary_secret_key,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_id_from_bytes() {
        let bytes = [42u8; USER_ID_SIZE];
        let user_id = UserId::from_bytes(bytes);
        assert_eq!(user_id.as_bytes(), &bytes);
    }

    #[test]
    fn test_user_id_as_ref() {
        let bytes = [42u8; USER_ID_SIZE];
        let user_id = UserId::from_bytes(bytes);
        let as_ref: &[u8] = user_id.as_ref();
        assert_eq!(as_ref, &bytes);
    }

    #[test]
    fn test_user_id_equality() {
        let user_id1 = UserId::from_bytes([1u8; USER_ID_SIZE]);
        let user_id2 = UserId::from_bytes([1u8; USER_ID_SIZE]);
        let user_id3 = UserId::from_bytes([2u8; USER_ID_SIZE]);

        assert_eq!(user_id1, user_id2);
        assert_ne!(user_id1, user_id3);
    }

    #[test]
    fn test_static_root_secret_from_passphrase() {
        let passphrase = b"test passphrase 123";
        let root_secret = StaticRootSecret::from_passphrase(passphrase);
        assert_eq!(root_secret.as_slice().len(), STATIC_ROOT_SECRET_SIZE);
    }

    #[test]
    fn test_static_root_secret_deterministic() {
        let passphrase = b"deterministic test";
        let root_secret1 = StaticRootSecret::from_passphrase(passphrase);
        let root_secret2 = StaticRootSecret::from_passphrase(passphrase);
        assert_eq!(root_secret1.as_slice(), root_secret2.as_slice());
    }

    #[test]
    fn test_static_root_secret_different_passphrases() {
        let root_secret1 = StaticRootSecret::from_passphrase(b"passphrase1");
        let root_secret2 = StaticRootSecret::from_passphrase(b"passphrase2");
        assert_ne!(root_secret1.as_slice(), root_secret2.as_slice());
    }

    #[test]
    fn test_static_root_secret_from_bytes() {
        let bytes = [99u8; STATIC_ROOT_SECRET_SIZE];
        let root_secret = StaticRootSecret::from_bytes(bytes);
        assert_eq!(root_secret.as_slice(), &bytes);
    }

    #[test]
    fn test_derive_keys_deterministic() {
        let passphrase = b"my secure passphrase";
        let root_secret = StaticRootSecret::from_passphrase(passphrase);
        let secondary_pub_key = [5u8; SECONDARY_PUBLIC_KEY_SIZE];

        let (pub_keys1, _) = derive_keys_from_static_root_secret(&root_secret, secondary_pub_key);
        let (pub_keys2, _) = derive_keys_from_static_root_secret(&root_secret, secondary_pub_key);

        // Verify deterministic key derivation
        assert_eq!(
            pub_keys1.dsa_verification_key.as_bytes(),
            pub_keys2.dsa_verification_key.as_bytes()
        );
        assert_eq!(
            pub_keys1.kem_public_key.as_bytes(),
            pub_keys2.kem_public_key.as_bytes()
        );
        assert_eq!(
            pub_keys1.massa_public_key.to_bytes(),
            pub_keys2.massa_public_key.to_bytes()
        );
        assert_eq!(
            pub_keys1.secondary_public_key,
            pub_keys2.secondary_public_key
        );
    }

    #[test]
    fn test_derive_keys_different_roots() {
        let root_secret1 = StaticRootSecret::from_passphrase(b"passphrase1");
        let root_secret2 = StaticRootSecret::from_passphrase(b"passphrase2");
        let secondary_pub_key = [7u8; SECONDARY_PUBLIC_KEY_SIZE];

        let (pub_keys1, _) = derive_keys_from_static_root_secret(&root_secret1, secondary_pub_key);
        let (pub_keys2, _) = derive_keys_from_static_root_secret(&root_secret2, secondary_pub_key);

        // Verify different root secrets produce different keys
        assert_ne!(
            pub_keys1.dsa_verification_key.as_bytes(),
            pub_keys2.dsa_verification_key.as_bytes()
        );
    }

    #[test]
    fn test_user_id_derivation_deterministic() {
        let passphrase = b"test user id derivation";
        let root_secret = StaticRootSecret::from_passphrase(passphrase);
        let secondary_pub_key = [10u8; SECONDARY_PUBLIC_KEY_SIZE];

        let (pub_keys, _) = derive_keys_from_static_root_secret(&root_secret, secondary_pub_key);

        let user_id1 = pub_keys.derive_id();
        let user_id2 = pub_keys.derive_id();

        assert_eq!(user_id1, user_id2);
    }

    #[test]
    fn test_user_id_unique_for_different_keys() {
        let root_secret1 = StaticRootSecret::from_passphrase(b"user1");
        let root_secret2 = StaticRootSecret::from_passphrase(b"user2");
        let secondary_pub_key = [15u8; SECONDARY_PUBLIC_KEY_SIZE];

        let (pub_keys1, _) = derive_keys_from_static_root_secret(&root_secret1, secondary_pub_key);
        let (pub_keys2, _) = derive_keys_from_static_root_secret(&root_secret2, secondary_pub_key);

        let user_id1 = pub_keys1.derive_id();
        let user_id2 = pub_keys2.derive_id();

        assert_ne!(user_id1, user_id2);
    }

    #[test]
    fn test_derived_keys_structure() {
        let passphrase = b"structure test";
        let root_secret = StaticRootSecret::from_passphrase(passphrase);
        let secondary_pub_key = [20u8; SECONDARY_PUBLIC_KEY_SIZE];

        let (pub_keys, secret_keys) =
            derive_keys_from_static_root_secret(&root_secret, secondary_pub_key);

        // Verify public keys are properly set
        assert_eq!(pub_keys.secondary_public_key, secondary_pub_key);
        assert_eq!(
            secret_keys.secondary_secret_key.len(),
            SECONDARY_SECRET_KEY_SIZE
        );

        // Verify keys are not all zeros (they have been properly generated)
        assert_ne!(pub_keys.dsa_verification_key.as_bytes(), &[0u8; 1952]);
        assert_ne!(pub_keys.kem_public_key.as_bytes(), &[0u8; 1184]);
    }
}
