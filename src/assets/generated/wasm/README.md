# Echo WASM - WebAssembly Bindings

This crate provides WebAssembly bindings for the Echo secure messaging system, exposing the SessionManager and Auth facilities to JavaScript/TypeScript applications.

## Features

- **Session Management**: Create, persist, and manage encrypted messaging sessions
- **Authentication**: Generate and manage cryptographic keys from passphrases
- **Post-Quantum Security**: Uses ML-KEM and ML-DSA for quantum-resistant cryptography
- **Encrypted State**: Secure serialization and deserialization of session state

## Building

### Prerequisites

- Rust toolchain with `wasm32-unknown-unknown` target
- wasm-pack (optional, for generating npm package)

### Build with Cargo

```bash
cargo build --target wasm32-unknown-unknown --release
```

The compiled WASM module will be at:

```
../target/wasm32-unknown-unknown/release/echo_wasm.wasm
```

### Build with wasm-pack

For a complete npm-ready package with TypeScript definitions:

```bash
wasm-pack build --target web
```

## Usage

### JavaScript/TypeScript

```typescript
import init, {
  SessionManagerWrapper,
  SessionConfig,
  generate_user_keys,
  EncryptionKey,
  Message,
} from './echo_wasm';

// Initialize WASM
await init();

// Generate user keys from passphrase
const keys = generate_user_keys('my secure passphrase', new Uint8Array(32));
const publicKeys = keys.public_keys();
const secretKeys = keys.secret_keys();
const userId = publicKeys.derive_id();

// Create session manager with default configuration
const config = SessionConfig.new_default();
const manager = new SessionManagerWrapper(config);

// Establish session with peer
const peerKeys = generate_user_keys('peer passphrase', new Uint8Array(32));
const announcement = manager.establish_outgoing_session(
  peerKeys.public_keys(),
  publicKeys,
  secretKeys,
  new Uint8Array([1, 2, 3]) // seeker prefix
);
// Publish announcement to blockchain...

// Feed incoming announcement
manager.feed_incoming_announcement(announcementBytes, publicKeys, secretKeys);

// Send a message
const message = new Message(new TextEncoder().encode('Hello!'));
const peerId = peerKeys.public_keys().derive_id();
const sendOutput = manager.send_message(peerId, message);
if (sendOutput) {
  // Publish sendOutput.seeker and sendOutput.ciphertext to blockchain
}

// Check for incoming messages
const seekers = manager.get_message_board_read_keys();
for (let i = 0; i < seekers.length; i++) {
  const seeker = seekers.get(i);
  // Read from blockchain using seeker...
  const received = manager.feed_incoming_message_board_read(
    seeker,
    ciphertext,
    secretKeys
  );
  if (received) {
    console.log(
      'Received:',
      new TextDecoder().decode(received.message.contents)
    );
  }
}

// Persist session state
const encryptionKey = EncryptionKey.generate();
const encrypted = manager.to_encrypted_blob(encryptionKey);
// Save encrypted blob to storage...

// Restore session state
const restored = SessionManagerWrapper.from_encrypted_blob(
  encrypted,
  encryptionKey
);
```

### Custom Configuration

```typescript
const config = new SessionConfig(
  604800000, // max_incoming_announcement_age_millis (1 week)
  60000, // max_incoming_announcement_future_millis (1 minute)
  604800000, // max_incoming_message_age_millis (1 week)
  60000, // max_incoming_message_future_millis (1 minute)
  604800000, // max_session_inactivity_millis (1 week)
  86400000, // keep_alive_interval_millis (1 day)
  10000 // max_session_lag_length
);
```

## API Reference

### AEAD Encryption Functions

Direct access to AES-256-SIV authenticated encryption:

- `aead_encrypt(key: EncryptionKey, nonce: Nonce, plaintext: Uint8Array, aad: Uint8Array)`: Encrypt data
- `aead_decrypt(key: EncryptionKey, nonce: Nonce, ciphertext: Uint8Array, aad: Uint8Array)`: Decrypt data

#### AEAD Example

```typescript
import { EncryptionKey, Nonce, aead_encrypt, aead_decrypt } from './echo_wasm';

// Generate key and nonce
const key = EncryptionKey.generate();
const nonce = Nonce.generate();

// Encrypt some data
const plaintext = new TextEncoder().encode('Secret message');
const aad = new TextEncoder().encode('context info'); // Additional authenticated data
const ciphertext = aead_encrypt(key, nonce, plaintext, aad);

// Decrypt
const decrypted = aead_decrypt(key, nonce, ciphertext, aad);
if (decrypted) {
  console.log('Success:', new TextDecoder().decode(decrypted));
} else {
  console.error('Decryption failed - tampering detected!');
}
```

**Security Notes:**

- Nonces should be unique per encryption (16 bytes)
- AAD (Additional Authenticated Data) is authenticated but NOT encrypted
- AES-SIV is nonce-misuse resistant - reusing nonces only leaks if plaintexts are identical
- Keys are 64 bytes (512 bits) for AES-256-SIV

### SessionManagerWrapper

Main class for managing messaging sessions.

- `new(config: SessionConfig)`: Create new session manager
- `from_encrypted_blob(blob: Uint8Array, key: EncryptionKey)`: Restore from encrypted state
- `to_encrypted_blob(key: EncryptionKey)`: Serialize to encrypted blob
- `establish_outgoing_session(...)`: Initiate session with peer
- `feed_incoming_announcement(...)`: Process incoming announcements
- `send_message(peer_id: Uint8Array, message: Message)`: Send message to peer
- `feed_incoming_message_board_read(...)`: Process incoming messages
- `get_message_board_read_keys()`: Get seekers to monitor
- `peer_list()`: Get all peer IDs
- `peer_session_status(peer_id: Uint8Array)`: Get session status
- `peer_discard(peer_id: Uint8Array)`: Remove peer
- `refresh()`: Refresh sessions and get keep-alive list

### Auth Functions

- `generate_user_keys(passphrase: string, secondary_key: Uint8Array)`: Generate keys from passphrase

### Other Classes

- `SessionConfig`: Session manager configuration
- `EncryptionKey`: AES-256-SIV key (64 bytes)
  - `generate()`: Generate random key
  - `from_bytes(bytes: Uint8Array)`: Create from bytes
  - `to_bytes()`: Get raw bytes
- `Nonce`: AES-256-SIV nonce (16 bytes)
  - `generate()`: Generate random nonce
  - `from_bytes(bytes: Uint8Array)`: Create from bytes
  - `to_bytes()`: Get raw bytes
- `Message`: Message to send through sessions
- `UserPublicKeys`: User's public keys
- `UserSecretKeys`: User's secret keys
- `SessionStatus`: Enum for session states
