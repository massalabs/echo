//! Echo WASM API
//!
//! This crate provides WebAssembly bindings for the Echo secure messaging system,
//! exposing the SessionManager, Auth, and AEAD encryption facilities to JavaScript/TypeScript applications.
//!
//! # Features
//!
//! - **Session Management**: Create and manage encrypted messaging sessions
//! - **Authentication**: Generate cryptographic keys from passphrases
//! - **AEAD Encryption**: Direct access to AES-256-SIV authenticated encryption
//! - **Post-Quantum Security**: Uses ML-KEM and ML-DSA for quantum resistance

use wasm_bindgen::prelude::*;

// Set up panic hook for better error messages in the browser
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// Session manager configuration for controlling session behavior.
#[wasm_bindgen]
pub struct SessionConfig {
    inner: sessions::SessionManagerConfig,
}

#[wasm_bindgen]
impl SessionConfig {
    /// Creates a new session configuration with the given parameters.
    #[wasm_bindgen(constructor)]
    pub fn new(
        max_incoming_announcement_age_millis: f64,
        max_incoming_announcement_future_millis: f64,
        max_incoming_message_age_millis: f64,
        max_incoming_message_future_millis: f64,
        max_session_inactivity_millis: f64,
        keep_alive_interval_millis: f64,
        max_session_lag_length: u64,
    ) -> Self {
        Self {
            inner: sessions::SessionManagerConfig {
                max_incoming_announcement_age_millis: max_incoming_announcement_age_millis as u128,
                max_incoming_announcement_future_millis: max_incoming_announcement_future_millis
                    as u128,
                max_incoming_message_age_millis: max_incoming_message_age_millis as u128,
                max_incoming_message_future_millis: max_incoming_message_future_millis as u128,
                max_session_inactivity_millis: max_session_inactivity_millis as u128,
                keep_alive_interval_millis: keep_alive_interval_millis as u128,
                max_session_lag_length,
            },
        }
    }

    /// Creates a default configuration with sensible defaults:
    /// - Announcement age: 1 week
    /// - Announcement future: 1 minute
    /// - Message age: 1 week
    /// - Message future: 1 minute
    /// - Session inactivity: 1 week
    /// - Keep-alive interval: 1 day
    /// - Max lag: 10000 messages
    pub fn new_default() -> Self {
        Self {
            inner: sessions::SessionManagerConfig {
                max_incoming_announcement_age_millis: 604_800_000, // 1 week
                max_incoming_announcement_future_millis: 60_000,   // 1 minute
                max_incoming_message_age_millis: 604_800_000,      // 1 week
                max_incoming_message_future_millis: 60_000,        // 1 minute
                max_session_inactivity_millis: 604_800_000,        // 1 week
                keep_alive_interval_millis: 86_400_000,            // 1 day
                max_session_lag_length: 10000,
            },
        }
    }
}

/// User public keys for authentication and encryption.
#[wasm_bindgen]
pub struct UserPublicKeys {
    inner: auth::UserPublicKeys,
}

#[wasm_bindgen]
impl UserPublicKeys {
    /// Derives a unique user ID from the public keys.
    pub fn derive_id(&self) -> Vec<u8> {
        self.inner.derive_id().as_bytes().to_vec()
    }

    /// Gets the DSA verification key bytes.
    #[wasm_bindgen(getter)]
    pub fn dsa_verification_key(&self) -> Vec<u8> {
        self.inner.dsa_verification_key.as_bytes().to_vec()
    }

    /// Gets the KEM public key bytes.
    #[wasm_bindgen(getter)]
    pub fn kem_public_key(&self) -> Vec<u8> {
        self.inner.kem_public_key.as_bytes().to_vec()
    }

    /// Gets the Massa public key bytes.
    #[wasm_bindgen(getter)]
    pub fn massa_public_key(&self) -> Vec<u8> {
        self.inner.massa_public_key.to_bytes()
    }

    /// Serializes the public keys to bytes.
    pub fn to_bytes(&self) -> Result<Vec<u8>, JsValue> {
        Ok(self.inner.to_bytes())
    }

    /// Deserializes public keys from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<UserPublicKeys, JsValue> {
        let inner = bincode::serde::decode_from_slice(bytes, bincode::config::standard())
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?
            .0;
        Ok(UserPublicKeys { inner })
    }
}

/// User secret keys for signing and decryption.
#[wasm_bindgen]
pub struct UserSecretKeys {
    inner: auth::UserSecretKeys,
}

#[wasm_bindgen]
impl UserSecretKeys {
    /// Serializes the secret keys to bytes for secure storage.
    pub fn to_bytes(&self) -> Result<Vec<u8>, JsValue> {
        bincode::serde::encode_to_vec(&self.inner, bincode::config::standard())
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Deserializes secret keys from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<UserSecretKeys, JsValue> {
        let inner = bincode::serde::decode_from_slice(bytes, bincode::config::standard())
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?
            .0;
        Ok(UserSecretKeys { inner })
    }

    /// Gets the DSA signing key bytes.
    #[wasm_bindgen(getter)]
    pub fn dsa_signing_key(&self) -> Vec<u8> {
        self.inner.dsa_signing_key.as_bytes().to_vec()
    }

    /// Gets the KEM secret key bytes.
    #[wasm_bindgen(getter)]
    pub fn kem_secret_key(&self) -> Vec<u8> {
        self.inner.kem_secret_key.as_bytes().to_vec()
    }

    /// Gets only the Massa secret key bytes
    #[wasm_bindgen(getter)]
    pub fn massa_secret_key(&self) -> Vec<u8> {
        self.inner.massa_keypair.to_bytes().to_vec()
    }
}

/// User keypair containing both public and secret keys.
#[wasm_bindgen]
pub struct UserKeys {
    public_keys_bytes: Vec<u8>,
    secret_keys_bytes: Vec<u8>,
}

#[wasm_bindgen]
impl UserKeys {
    /// Gets the public keys.
    pub fn public_keys(&self) -> Result<UserPublicKeys, JsValue> {
        UserPublicKeys::from_bytes(&self.public_keys_bytes)
    }

    /// Gets the secret keys.
    pub fn secret_keys(&self) -> Result<UserSecretKeys, JsValue> {
        UserSecretKeys::from_bytes(&self.secret_keys_bytes)
    }
}

/// Generates user keys from a passphrase using password-based key derivation.
#[wasm_bindgen]
pub fn generate_user_keys(passphrase: &str) -> Result<UserKeys, JsValue> {
    let root_secret = auth::StaticRootSecret::from_passphrase(passphrase.as_bytes());

    let (public_keys, secret_keys) = auth::derive_keys_from_static_root_secret(&root_secret);

    Ok(UserKeys {
        public_keys_bytes: public_keys.to_bytes(),
        secret_keys_bytes: bincode::serde::encode_to_vec(&secret_keys, bincode::config::standard())
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?,
    })
}

/// Encryption key for AEAD operations (AES-256-SIV).
///
/// AES-256-SIV uses a 64-byte (512-bit) key: two 256-bit keys for encryption and MAC.
#[wasm_bindgen]
pub struct EncryptionKey {
    inner: crypto_aead::Key,
}

#[wasm_bindgen]
impl EncryptionKey {
    /// Generates a new random encryption key (64 bytes).
    pub fn generate() -> Self {
        let mut key_bytes = [0u8; 64];
        crypto_rng::fill_buffer(&mut key_bytes);
        Self {
            inner: crypto_aead::Key::from(key_bytes),
        }
    }

    /// Generates a deterministic encryption key (64 bytes) from a seed and salt.
    ///
    /// Uses Argon2id via `crypto_password_kdf` to derive a 64-byte key suitable for
    /// AES-256-SIV (which requires 64 bytes: 2×256-bit keys).
    ///
    /// - `seed`: application-provided seed string (treat like a password)
    /// - `salt`: unique, random salt (minimum 8 bytes, recommended 16+ bytes)
    pub fn from_seed(seed: &str, salt: &[u8]) -> Result<EncryptionKey, JsValue> {
        if salt.len() < 8 {
            return Err(JsValue::from_str("Salt must be at least 8 bytes"));
        }

        let mut key_bytes = [0u8; 64];
        crypto_password_kdf::derive(seed.as_bytes(), salt, &mut key_bytes);
        Ok(Self {
            inner: crypto_aead::Key::from(key_bytes),
        })
    }

    /// Creates an encryption key from raw bytes (must be 64 bytes).
    pub fn from_bytes(bytes: &[u8]) -> Result<EncryptionKey, JsValue> {
        if bytes.len() != 64 {
            return Err(JsValue::from_str("Key must be 64 bytes"));
        }
        let mut key_bytes = [0u8; 64];
        key_bytes.copy_from_slice(bytes);
        Ok(Self {
            inner: crypto_aead::Key::from(key_bytes),
        })
    }

    /// Gets the raw bytes of the encryption key.
    pub fn to_bytes(&self) -> Vec<u8> {
        self.inner.as_bytes().to_vec()
    }
}

/// Nonce for AEAD operations (AES-256-SIV).
///
/// AES-256-SIV uses a 16-byte (128-bit) nonce. The nonce should be unique
/// per encryption for maximum security, though SIV mode is nonce-misuse resistant.
#[wasm_bindgen]
pub struct Nonce {
    inner: crypto_aead::Nonce,
}

#[wasm_bindgen]
impl Nonce {
    /// Generates a new random nonce (16 bytes).
    pub fn generate() -> Self {
        let mut nonce_bytes = [0u8; 16];
        crypto_rng::fill_buffer(&mut nonce_bytes);
        Self {
            inner: crypto_aead::Nonce::from(nonce_bytes),
        }
    }

    /// Creates a nonce from raw bytes (must be 16 bytes).
    pub fn from_bytes(bytes: &[u8]) -> Result<Nonce, JsValue> {
        if bytes.len() != 16 {
            return Err(JsValue::from_str("Nonce must be 16 bytes"));
        }
        let mut nonce_bytes = [0u8; 16];
        nonce_bytes.copy_from_slice(bytes);
        Ok(Self {
            inner: crypto_aead::Nonce::from(nonce_bytes),
        })
    }

    /// Gets the raw bytes of the nonce.
    pub fn to_bytes(&self) -> Vec<u8> {
        self.inner.as_bytes().to_vec()
    }
}

/// Encrypts data using AES-256-SIV authenticated encryption.
///
/// # Parameters
///
/// - `key`: The encryption key (64 bytes)
/// - `nonce`: The nonce (16 bytes, should be unique per encryption)
/// - `plaintext`: The data to encrypt
/// - `aad`: Additional authenticated data (not encrypted, but authenticated)
///
/// # Returns
///
/// The ciphertext with authentication tag appended.
///
/// # Security Notes
///
/// - The nonce should be unique for each encryption operation
/// - AES-SIV is nonce-misuse resistant: reusing nonces only leaks if plaintexts are identical
/// - AAD is authenticated but not encrypted; it must be transmitted separately
/// - The same AAD must be provided during decryption
///
/// # Example
///
/// ```javascript
/// const key = EncryptionKey.generate();
/// const nonce = Nonce.generate();
/// const plaintext = new TextEncoder().encode("Secret message");
/// const aad = new TextEncoder().encode("context info");
///
/// const ciphertext = aead_encrypt(key, nonce, plaintext, aad);
/// ```
#[wasm_bindgen]
pub fn aead_encrypt(key: &EncryptionKey, nonce: &Nonce, plaintext: &[u8], aad: &[u8]) -> Vec<u8> {
    crypto_aead::encrypt(&key.inner, &nonce.inner, plaintext, aad)
}

/// Decrypts data using AES-256-SIV authenticated encryption.
///
/// # Parameters
///
/// - `key`: The encryption key (64 bytes, must match encryption key)
/// - `nonce`: The nonce (16 bytes, must match encryption nonce)
/// - `ciphertext`: The encrypted data with authentication tag
/// - `aad`: Additional authenticated data (must match encryption AAD)
///
/// # Returns
///
/// The decrypted plaintext, or `null` if authentication fails.
///
/// # Security Notes
///
/// - Returns `null` if:
///   - The ciphertext has been tampered with
///   - The wrong key or nonce is used
///   - The AAD doesn't match
/// - Never ignore a decryption failure; it indicates tampering or corruption
///
/// # Example
///
/// ```javascript
/// const plaintext = aead_decrypt(key, nonce, ciphertext, aad);
/// if (plaintext) {
///     console.log("Decrypted:", new TextDecoder().decode(plaintext));
/// } else {
///     console.error("Decryption failed - data may be corrupted or tampered");
/// }
/// ```
#[wasm_bindgen]
pub fn aead_decrypt(
    key: &EncryptionKey,
    nonce: &Nonce,
    ciphertext: &[u8],
    aad: &[u8],
) -> Option<Vec<u8>> {
    crypto_aead::decrypt(&key.inner, &nonce.inner, ciphertext, aad)
}

/// Session status indicating the state of a peer session.
#[wasm_bindgen]
pub enum SessionStatus {
    Active,
    UnknownPeer,
    NoSession,
    PeerRequested,
    SelfRequested,
    Killed,
    Saturated,
}

/// Output from sending a message.
#[wasm_bindgen]
pub struct SendMessageOutput {
    seeker: Vec<u8>,
    data: Vec<u8>,
}

#[wasm_bindgen]
impl SendMessageOutput {
    /// Gets the seeker (identifier for message board lookup).
    #[wasm_bindgen(getter)]
    pub fn seeker(&self) -> Vec<u8> {
        self.seeker.clone()
    }

    /// Gets the encrypted message data.
    #[wasm_bindgen(getter)]
    pub fn data(&self) -> Vec<u8> {
        self.data.clone()
    }
}

/// Output from receiving a message.
#[wasm_bindgen]
pub struct ReceiveMessageOutput {
    message: Vec<u8>,
    timestamp: f64,
    acknowledged_seekers: js_sys::Array,
}

#[wasm_bindgen]
impl ReceiveMessageOutput {
    /// Gets the received message contents.
    #[wasm_bindgen(getter)]
    pub fn message(&self) -> Vec<u8> {
        self.message.clone()
    }

    /// Gets the message timestamp (milliseconds since Unix epoch).
    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> f64 {
        self.timestamp
    }

    /// Gets the list of newly acknowledged seekers.
    #[wasm_bindgen(getter)]
    pub fn acknowledged_seekers(&self) -> js_sys::Array {
        self.acknowledged_seekers.clone()
    }
}

/// Session manager wrapper for WebAssembly.
#[wasm_bindgen]
pub struct SessionManagerWrapper {
    inner: sessions::SessionManager,
}

#[wasm_bindgen]
impl SessionManagerWrapper {
    /// Creates a new session manager with the given configuration.
    #[wasm_bindgen(constructor)]
    pub fn new(config: SessionConfig) -> Self {
        Self {
            inner: sessions::SessionManager::new(config.inner),
        }
    }

    /// Deserializes a session manager from an encrypted blob.
    pub fn from_encrypted_blob(
        encrypted_blob: &[u8],
        key: &EncryptionKey,
    ) -> Result<SessionManagerWrapper, JsValue> {
        let inner = sessions::SessionManager::from_encrypted_blob(encrypted_blob, &key.inner)
            .ok_or_else(|| JsValue::from_str("Failed to decrypt session manager"))?;
        Ok(Self { inner })
    }

    /// Serializes and encrypts the session manager into a blob.
    pub fn to_encrypted_blob(&self, key: &EncryptionKey) -> Result<Vec<u8>, JsValue> {
        self.inner
            .to_encrypted_blob(&key.inner)
            .ok_or_else(|| JsValue::from_str("Failed to encrypt session manager"))
    }

    /// Establishes an outgoing session with a peer.
    pub fn establish_outgoing_session(
        &mut self,
        peer_pk: &UserPublicKeys,
        our_pk: &UserPublicKeys,
        our_sk: &UserSecretKeys,
    ) -> Vec<u8> {
        self.inner
            .establish_outgoing_session(&peer_pk.inner, &our_pk.inner, &our_sk.inner)
    }

    /// Feeds an incoming announcement from the blockchain.
    pub fn feed_incoming_announcement(
        &mut self,
        announcement_bytes: &[u8],
        our_pk: &UserPublicKeys,
        our_sk: &UserSecretKeys,
    ) -> Option<UserPublicKeys> {
        self
            .inner
            .feed_incoming_announcement(announcement_bytes, &our_pk.inner, &our_sk.inner)
            .map(|pk| UserPublicKeys { inner: pk })
    }

    /// Gets the list of message board seekers to monitor.
    pub fn get_message_board_read_keys(&self) -> js_sys::Array {
        let seekers = self.inner.get_message_board_read_keys();
        let array = js_sys::Array::new();
        for seeker in seekers {
            let js_seeker = js_sys::Uint8Array::from(&seeker[..]);
            array.push(&js_seeker);
        }
        array
    }

    /// Sends a message to a peer.
    pub fn send_message(
        &mut self,
        peer_id: &[u8],
        message_contents: &[u8],
    ) -> Result<Option<SendMessageOutput>, JsValue> {
        if peer_id.len() != 32 {
            return Err(JsValue::from_str("Peer ID must be 32 bytes"));
        }
        let mut peer_id_arr = [0u8; 32];
        peer_id_arr.copy_from_slice(peer_id);
        let peer_id = auth::UserId::from_bytes(peer_id_arr);

        Ok(self
            .inner
            .send_message(&peer_id, message_contents)
            .map(|output| SendMessageOutput {
                seeker: output.seeker.clone(),
                data: output.data.clone(),
            }))
    }

    /// Processes an incoming message from the message board.
    pub fn feed_incoming_message_board_read(
        &mut self,
        seeker: &[u8],
        ciphertext: &[u8],
        our_sk: &UserSecretKeys,
    ) -> Option<ReceiveMessageOutput> {
        self.inner
            .feed_incoming_message_board_read(seeker, ciphertext, &our_sk.inner)
            .map(|output| {
                let acknowledged_seekers = js_sys::Array::new();
                for ack_seeker in &output.newly_acknowledged_self_seekers {
                    let js_seeker = js_sys::Uint8Array::from(&ack_seeker[..]);
                    acknowledged_seekers.push(&js_seeker);
                }

                ReceiveMessageOutput {
                    message: output.message.clone(),
                    timestamp: output.timestamp as f64,
                    acknowledged_seekers,
                }
            })
    }

    /// Gets the list of all peer IDs.
    pub fn peer_list(&self) -> js_sys::Array {
        let peers = self.inner.peer_list();
        let array = js_sys::Array::new();
        for peer_id in peers {
            let js_peer_id = js_sys::Uint8Array::from(peer_id.as_bytes());
            array.push(&js_peer_id);
        }
        array
    }

    /// Gets the session status for a peer.
    pub fn peer_session_status(&self, peer_id: &[u8]) -> Result<SessionStatus, JsValue> {
        if peer_id.len() != 32 {
            return Err(JsValue::from_str("Peer ID must be 32 bytes"));
        }
        let mut peer_id_arr = [0u8; 32];
        peer_id_arr.copy_from_slice(peer_id);
        let peer_id = auth::UserId::from_bytes(peer_id_arr);

        Ok(match self.inner.peer_session_status(&peer_id) {
            sessions::SessionStatus::Active => SessionStatus::Active,
            sessions::SessionStatus::UnknownPeer => SessionStatus::UnknownPeer,
            sessions::SessionStatus::NoSession => SessionStatus::NoSession,
            sessions::SessionStatus::PeerRequested => SessionStatus::PeerRequested,
            sessions::SessionStatus::SelfRequested => SessionStatus::SelfRequested,
            sessions::SessionStatus::Killed => SessionStatus::Killed,
            sessions::SessionStatus::Saturated => SessionStatus::Saturated,
        })
    }

    /// Discards a peer and all associated session state.
    pub fn peer_discard(&mut self, peer_id: &[u8]) -> Result<(), JsValue> {
        if peer_id.len() != 32 {
            return Err(JsValue::from_str("Peer ID must be 32 bytes"));
        }
        let mut peer_id_arr = [0u8; 32];
        peer_id_arr.copy_from_slice(peer_id);
        let peer_id = auth::UserId::from_bytes(peer_id_arr);

        self.inner.peer_discard(&peer_id);
        Ok(())
    }

    /// Refreshes sessions and returns peer IDs that need keep-alive messages.
    pub fn refresh(&mut self) -> js_sys::Array {
        let peers = self.inner.refresh();
        let array = js_sys::Array::new();
        for peer_id in peers {
            let js_peer_id = js_sys::Uint8Array::from(peer_id.as_bytes());
            array.push(&js_peer_id);
        }
        array
    }
}
