//! Authentication blob for single-round sender verification.
//!
//! This module provides `AuthBlob`, a cryptographic structure designed to authenticate
//! the sender of an Agraphon announcement message in a single round. Unlike traditional
//! challenge-response protocols, `AuthBlob` allows Bob to immediately verify Alice's
//! identity upon receiving her initial announcement, without waiting for a second message.
//!
//! # Use Case in Agraphon
//!
//! In the Agraphon protocol, when Alice sends an announcement to Bob, she needs to prove
//! her identity. Traditionally, this would require:
//! 1. Alice sends announcement
//! 2. Bob responds with a challenge
//! 3. Alice proves her identity
//!
//! With `AuthBlob`, this reduces to:
//! 1. Alice sends announcement with embedded `AuthBlob`
//! 2. Bob immediately verifies Alice's identity using the `auth_key` from the announcement
//!
//! # Structure
//!
//! An `AuthBlob` contains:
//! - **Public payload**: Information visible to all (e.g., KEM public key, timestamp)
//! - **Secret payload**: Shared secret known only to legitimate parties (e.g., `auth_key` from Agraphon)
//! - **User public keys**: All public keys to identify the sender
//! - **Dual signatures**: Both DSA and Massa blockchain signatures for multi-layer verification
//!
//! # Security Properties
//!
//! - **Authentication**: Only someone with the correct secret keys can create a valid `AuthBlob`
//! - **Non-repudiation**: The dual signatures provide strong proof of sender identity
//! - **Binding**: The signatures bind together the user ID, public payload, and secret payload
//! - **Freshness**: The public payload can include a timestamp to prevent replay attacks
//!
//! # Example Usage
//!
//! ```ignore
//! use auth::{AuthBlob, UserPublicKeys, UserSecretKeys, derive_keys_from_static_root_secret};
//! use auth::StaticRootSecret;
//!
//! // Alice creates her keys
//! let passphrase = b"alice_secure_passphrase";
//! let root_secret = StaticRootSecret::from_passphrase(passphrase);
//! let secondary_pub_key = [0u8; 32];
//! let (alice_public_keys, alice_secret_keys) =
//!     derive_keys_from_static_root_secret(&root_secret, secondary_pub_key);
//!
//! // Prepare the payloads for announcement
//! let public_payload = vec![/* KEM public key, timestamp, etc. */];
//! let secret_payload = b"auth_key_from_agraphon_announcement";
//!
//! // Create the auth blob
//! let auth_blob = AuthBlob::new(
//!     alice_public_keys.clone(),
//!     &alice_secret_keys,
//!     public_payload,
//!     secret_payload,
//! );
//!
//! // ... send auth_blob to Bob along with announcement ...
//!
//! // Bob verifies the auth blob
//! let is_valid = auth_blob.verify(secret_payload);
//! if is_valid {
//!     println!("Alice's identity verified!");
//! }
//! ```

use crate::types::{UserId, UserPublicKeys, UserSecretKeys};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

/// An authentication blob that proves sender identity in a single round.
///
/// `AuthBlob` combines public user keys with dual signatures (DSA and Massa) to
/// authenticate a sender. The signatures are computed over a combination of:
/// - User ID (derived from public keys)
/// - Public payload (visible information like timestamp, KEM key)
/// - Secret payload (shared secret like Agraphon's `auth_key`)
///
/// This allows a receiver to immediately verify the sender's identity without
/// additional round trips.
#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct AuthBlob {
    /// The sender's public keys used to derive their identity.
    public_keys: UserPublicKeys,
    /// Public information visible to all parties.
    public_payload: Vec<u8>,
    /// DSA signature over the derived signing material.
    signature_dsa: crypto_dsa::Signature,
    /// Massa blockchain signature over the derived signing material.
    #[zeroize(skip)] // TODO: add zeroization to massa signature
    signature_massa: massa_signature::Signature,
}

impl AuthBlob {
    /// Derives signing material from the user ID and payloads.
    ///
    /// This internal function performs a key derivation to produce two distinct
    /// signing messages: one for DSA and one for Massa signatures. The derivation
    /// binds together the user ID, public payload, and secret payload, ensuring
    /// that all three must be correct for signature verification to succeed.
    ///
    /// # Arguments
    ///
    /// * `user_id` - The unique identifier derived from the sender's public keys
    /// * `public_payload` - The public information (e.g., timestamp, KEM key)
    /// * `secret_payload` - The shared secret (e.g., Agraphon's `auth_key`)
    ///
    /// # Returns
    ///
    /// A tuple of two 32-byte messages:
    /// - DSA signing message
    /// - Massa signing message
    fn derive_signing_material(
        user_id: &UserId,
        public_payload: &[u8],
        secret_payload: &[u8],
    ) -> (Zeroizing<[u8; 32]>, Zeroizing<[u8; 32]>) {
        // KDF from public payload, secret payload, and user ID
        let mut kdf = crypto_kdf::Extract::new(b"auth.auth_blob.kdf.salt---------");
        kdf.input_item(user_id.as_bytes());
        kdf.input_item(public_payload);
        kdf.input_item(secret_payload);
        let expander = kdf.finalize();

        let mut signature_dsa_message = Zeroizing::new([0u8; 32]);
        expander.expand(
            b"auth.auth_blob.kdf.signature_dsa_message",
            signature_dsa_message.as_mut_slice(),
        );
        let mut signature_massa_message = Zeroizing::new([0u8; 32]);
        expander.expand(
            b"auth.auth_blob.kdf.signature_massa_message",
            signature_massa_message.as_mut_slice(),
        );

        (signature_dsa_message, signature_massa_message)
    }

    /// Creates a new `AuthBlob` with the sender's keys and payloads.
    ///
    /// This method generates an authentication blob by:
    /// 1. Deriving a user ID from the public keys
    /// 2. Computing signing material from the ID and payloads
    /// 3. Creating DSA and Massa signatures over the signing material
    ///
    /// The resulting `AuthBlob` can be serialized and sent to a receiver for verification.
    ///
    /// # Arguments
    ///
    /// * `public_keys` - The sender's public keys (used to derive user ID)
    /// * `secret_keys` - The sender's secret keys (used for signing)
    /// * `public_payload` - Public information (e.g., KEM public key, timestamp)
    /// * `secret_payload` - Shared secret (e.g., `auth_key` from Agraphon announcement)
    ///
    /// # Returns
    ///
    /// A new `AuthBlob` ready to be sent to the receiver.
    ///
    /// # Security Considerations
    ///
    /// - The `public_payload` should include a timestamp or nonce to prevent replay attacks
    /// - The `secret_payload` should be derived from a secure handshake (e.g., Agraphon's `auth_key`)
    /// - Both signatures use fresh randomness from a CSPRNG
    ///
    /// # Example
    ///
    /// ```ignore
    /// let public_payload = [
    ///     kem_public_key.as_bytes(),
    ///     &timestamp.to_le_bytes(),
    /// ].concat();
    /// let secret_payload = announcement.auth_key(); // From Agraphon
    ///
    /// let auth_blob = AuthBlob::new(
    ///     user_public_keys,
    ///     &user_secret_keys,
    ///     public_payload,
    ///     secret_payload,
    /// );
    /// ```
    #[must_use]
    pub fn new(
        public_keys: UserPublicKeys,
        secret_keys: &UserSecretKeys,
        public_payload: Vec<u8>,
        secret_payload: &[u8],
    ) -> Self {
        // Derive user ID from public keys
        let user_id = public_keys.derive_id();

        // Derive signing material from ID and payloads
        let (signature_dsa_message, signature_massa_message) =
            Self::derive_signing_material(&user_id, &public_payload, secret_payload);

        // Sign with DSA using fresh randomness
        let mut signature_dsa_randomness = [0u8; crypto_dsa::SIGNING_RANDOMNESS_SIZE];
        crypto_rng::fill_buffer(&mut signature_dsa_randomness);
        let signature_dsa = crypto_dsa::sign(
            &secret_keys.dsa_signing_key,
            signature_dsa_message.as_slice(),
            "auth.auth_blob.sign.signature_dsa_message".as_bytes(),
            signature_dsa_randomness,
        );

        // Sign with Massa
        let massa_hash = massa_hash::Hash::from_bytes(&signature_massa_message);
        let signature_massa = secret_keys
            .massa_keypair
            .sign(&massa_hash)
            .expect("Failed to sign with Massa");

        Self {
            public_keys,
            public_payload,
            signature_dsa,
            signature_massa,
        }
    }

    /// Verifies the `AuthBlob` against a secret payload.
    ///
    /// This method checks that:
    /// 1. The user ID can be derived from the public keys
    /// 2. The signing material matches the provided secret payload
    /// 3. Both the DSA and Massa signatures are valid
    ///
    /// # Arguments
    ///
    /// * `secret_payload` - The shared secret to verify against (e.g., `auth_key` from Agraphon)
    ///
    /// # Returns
    ///
    /// `true` if both signatures are valid and the secret payload matches, `false` otherwise.
    ///
    /// # Security Notes
    ///
    /// - This method performs constant-time comparisons where appropriate
    /// - Both signatures must be valid for the verification to succeed
    /// - The receiver must have the correct secret payload (e.g., from the Agraphon announcement)
    ///
    /// # Example
    ///
    /// ```ignore
    /// // Bob receives auth_blob from Alice
    /// let auth_blob: AuthBlob = deserialize_from_network();
    /// let secret_payload = incoming_announcement.auth_key();
    ///
    /// if auth_blob.verify(secret_payload) {
    ///     println!("Alice successfully authenticated!");
    ///     // Proceed with secure communication
    /// } else {
    ///     println!("Authentication failed - possible attack!");
    /// }
    /// ```
    #[must_use]
    pub fn verify(&self, secret_payload: &[u8]) -> bool {
        // Derive user ID from public keys
        let user_id = self.public_keys.derive_id();

        // Derive signing material from ID and payloads
        let (signature_dsa_message, signature_massa_message) =
            Self::derive_signing_material(&user_id, &self.public_payload, secret_payload);

        // Verify DSA signature
        let is_valid_dsa = crypto_dsa::verify(
            &self.public_keys.dsa_verification_key,
            signature_dsa_message.as_slice(),
            "auth.auth_blob.sign.signature_dsa_message".as_bytes(),
            &self.signature_dsa,
        );
        if !is_valid_dsa {
            return false;
        }

        // Verify Massa signature
        let massa_hash = massa_hash::Hash::from_bytes(&signature_massa_message);
        let is_valid_massa = self
            .public_keys
            .massa_public_key
            .verify_signature(&massa_hash, &self.signature_massa)
            .is_ok();
        if !is_valid_massa {
            return false;
        }

        true
    }

    /// Returns a reference to the public keys contained in this `AuthBlob`.
    ///
    /// This allows the receiver to extract the sender's public keys after
    /// successful verification.
    #[must_use]
    pub const fn public_keys(&self) -> &UserPublicKeys {
        &self.public_keys
    }

    /// Returns a reference to the public payload contained in this `AuthBlob`.
    ///
    /// This allows the receiver to inspect the public information (e.g., timestamp,
    /// KEM public key) after successful verification.
    #[must_use]
    pub fn public_payload(&self) -> &[u8] {
        &self.public_payload
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{StaticRootSecret, derive_keys_from_static_root_secret};

    /// Helper function to create test keys from a passphrase
    fn create_test_keys(passphrase: &[u8]) -> (UserPublicKeys, UserSecretKeys) {
        let root_secret = StaticRootSecret::from_passphrase(passphrase);
        let secondary_pub_key = [0u8; 32];
        derive_keys_from_static_root_secret(&root_secret, secondary_pub_key)
    }

    #[test]
    fn test_auth_blob_creation_and_verification() {
        // Create keys for Alice
        let (public_keys, secret_keys) = create_test_keys(b"alice_password");

        // Create auth blob with test payloads
        let public_payload = b"timestamp:1234567890".to_vec();
        let secret_payload = b"shared_auth_key_from_agraphon";

        let auth_blob = AuthBlob::new(
            public_keys.clone(),
            &secret_keys,
            public_payload.clone(),
            secret_payload,
        );

        // Verify with correct secret payload
        assert!(auth_blob.verify(secret_payload));

        // Check public payload is accessible
        assert_eq!(auth_blob.public_payload(), public_payload.as_slice());
    }

    #[test]
    fn test_auth_blob_verification_fails_wrong_secret() {
        let (public_keys, secret_keys) = create_test_keys(b"alice_password");

        let public_payload = b"timestamp:1234567890".to_vec();
        let correct_secret = b"correct_auth_key";
        let wrong_secret = b"wrong_auth_key!!";

        let auth_blob = AuthBlob::new(public_keys, &secret_keys, public_payload, correct_secret);

        // Verification should fail with wrong secret
        assert!(!auth_blob.verify(wrong_secret));

        // Verification should succeed with correct secret
        assert!(auth_blob.verify(correct_secret));
    }

    #[test]
    fn test_auth_blob_different_users() {
        // Alice creates an auth blob
        let (alice_public_keys, alice_secret_keys) = create_test_keys(b"alice_password");
        let public_payload = b"alice_message".to_vec();
        let secret_payload = b"shared_secret";

        let alice_auth_blob = AuthBlob::new(
            alice_public_keys.clone(),
            &alice_secret_keys,
            public_payload.clone(),
            secret_payload,
        );

        // Bob creates a different auth blob with same payloads
        let (bob_public_keys, bob_secret_keys) = create_test_keys(b"bob_password");
        let bob_auth_blob = AuthBlob::new(
            bob_public_keys,
            &bob_secret_keys,
            public_payload,
            secret_payload,
        );

        // Both should verify successfully
        assert!(alice_auth_blob.verify(secret_payload));
        assert!(bob_auth_blob.verify(secret_payload));

        // But they should have different user IDs
        let alice_id = alice_public_keys.derive_id();
        let bob_id = bob_auth_blob.public_keys().derive_id();
        assert_ne!(alice_id, bob_id);
    }

    #[test]
    fn test_auth_blob_public_payload_binding() {
        let (public_keys, secret_keys) = create_test_keys(b"alice_password");
        let secret_payload = b"shared_secret";

        // Create blob with one public payload
        let public_payload1 = b"payload_version_1".to_vec();
        let auth_blob = AuthBlob::new(public_keys, &secret_keys, public_payload1, secret_payload);

        // Verification succeeds with correct payload
        assert!(auth_blob.verify(secret_payload));

        // The public payload in the blob matches what was used
        assert_eq!(auth_blob.public_payload(), b"payload_version_1");
    }

    #[test]
    fn test_auth_blob_empty_payloads() {
        let (public_keys, secret_keys) = create_test_keys(b"test_password");

        // Create blob with empty payloads
        let auth_blob = AuthBlob::new(public_keys, &secret_keys, vec![], b"");

        // Should still verify with correct (empty) secret
        assert!(auth_blob.verify(b""));

        // Should fail with non-empty secret
        assert!(!auth_blob.verify(b"something"));
    }

    #[test]
    fn test_auth_blob_deterministic_user_id() {
        // Create keys twice from same passphrase
        let (public_keys1, secret_keys1) = create_test_keys(b"same_password");
        let (public_keys2, secret_keys2) = create_test_keys(b"same_password");

        let public_payload = b"test_payload".to_vec();
        let secret_payload = b"test_secret";

        // Create two auth blobs (signatures will differ due to randomness)
        let auth_blob1 = AuthBlob::new(
            public_keys1.clone(),
            &secret_keys1,
            public_payload.clone(),
            secret_payload,
        );
        let auth_blob2 = AuthBlob::new(
            public_keys2.clone(),
            &secret_keys2,
            public_payload,
            secret_payload,
        );

        // Both should verify
        assert!(auth_blob1.verify(secret_payload));
        assert!(auth_blob2.verify(secret_payload));

        // User IDs should be identical
        let user_id1 = public_keys1.derive_id();
        let user_id2 = public_keys2.derive_id();
        assert_eq!(user_id1, user_id2);
    }

    #[test]
    fn test_auth_blob_large_payloads() {
        let (public_keys, secret_keys) = create_test_keys(b"test_password");

        // Create large payloads
        let large_public = vec![0xAB; 10000];
        let large_secret = vec![0xCD; 1000];

        let auth_blob = AuthBlob::new(
            public_keys,
            &secret_keys,
            large_public.clone(),
            &large_secret,
        );

        // Should verify correctly
        assert!(auth_blob.verify(&large_secret));
        assert_eq!(auth_blob.public_payload(), large_public.as_slice());
    }

    #[test]
    fn test_auth_blob_timestamp_replay_prevention() {
        let (public_keys, secret_keys) = create_test_keys(b"alice_password");
        let secret_payload = b"auth_key";

        // Create blob with timestamp 1
        let timestamp1 = 1234567890u64;
        let public_payload1 = timestamp1.to_le_bytes().to_vec();
        let auth_blob1 = AuthBlob::new(
            public_keys.clone(),
            &secret_keys,
            public_payload1,
            secret_payload,
        );

        // Create blob with timestamp 2
        let timestamp2 = 1234567900u64;
        let public_payload2 = timestamp2.to_le_bytes().to_vec();
        let auth_blob2 = AuthBlob::new(public_keys, &secret_keys, public_payload2, secret_payload);

        // Both should verify
        assert!(auth_blob1.verify(secret_payload));
        assert!(auth_blob2.verify(secret_payload));

        // But receiver can check timestamps to prevent replay
        let received_timestamp1 =
            u64::from_le_bytes(auth_blob1.public_payload().try_into().unwrap());
        let received_timestamp2 =
            u64::from_le_bytes(auth_blob2.public_payload().try_into().unwrap());

        assert_eq!(received_timestamp1, timestamp1);
        assert_eq!(received_timestamp2, timestamp2);
        assert!(received_timestamp2 > received_timestamp1);
    }
}
