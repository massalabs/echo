# AEAD (Authenticated Encryption with Associated Data) Usage Examples

This document demonstrates how to use the AEAD encryption facilities exposed by echo-wasm.

## Basic Encryption and Decryption

```javascript
import init, { EncryptionKey, Nonce, aead_encrypt, aead_decrypt } from './echo_wasm';

await init();

// Generate key and nonce
const key = EncryptionKey.generate();
const nonce = Nonce.generate();

// Encrypt a message
const message = new TextEncoder().encode("Hello, World!");
const aad = new Uint8Array(0); // No additional authenticated data

const ciphertext = aead_encrypt(key, nonce, message, aad);
console.log("Ciphertext length:", ciphertext.length);

// Decrypt the message
const decrypted = aead_decrypt(key, nonce, ciphertext, aad);
if (decrypted) {
    const text = new TextDecoder().decode(decrypted);
    console.log("Decrypted:", text); // "Hello, World!"
} else {
    console.error("Decryption failed!");
}
```

## Using Additional Authenticated Data (AAD)

AAD is data that is authenticated but NOT encrypted. It's useful for context information.

```javascript
// User ID and timestamp as AAD
const userId = "user123";
const timestamp = Date.now().toString();
const aadString = `${userId}:${timestamp}`;
const aad = new TextEncoder().encode(aadString);

const message = new TextEncoder().encode("Sensitive data");
const ciphertext = aead_encrypt(key, nonce, message, aad);

// To decrypt, you MUST provide the same AAD
const decrypted = aead_decrypt(key, nonce, ciphertext, aad);

// If AAD doesn't match, decryption fails
const wrongAad = new TextEncoder().encode("wrong:data");
const failed = aead_decrypt(key, nonce, ciphertext, wrongAad);
console.log(failed); // null
```

## Storing and Restoring Keys and Nonces

```javascript
// Store key for later use
const keyBytes = key.to_bytes();
localStorage.setItem('encryption_key', btoa(String.fromCharCode(...keyBytes)));

// Store nonce with ciphertext
const nonceBytes = nonce.to_bytes();
const combined = new Uint8Array(nonceBytes.length + ciphertext.length);
combined.set(nonceBytes, 0);
combined.set(ciphertext, nonceBytes.length);

// Later: restore and decrypt
const keyBytesRestored = new Uint8Array(
    atob(localStorage.getItem('encryption_key')).split('').map(c => c.charCodeAt(0))
);
const keyRestored = EncryptionKey.from_bytes(keyBytesRestored);

const nonceRestored = Nonce.from_bytes(combined.slice(0, 16));
const ciphertextRestored = combined.slice(16);

const decrypted = aead_decrypt(keyRestored, nonceRestored, ciphertextRestored, aad);
```

## Encrypting Files

```javascript
async function encryptFile(file) {
    const key = EncryptionKey.generate();
    const nonce = Nonce.generate();
    
    // Read file
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Use filename and size as AAD
    const aad = new TextEncoder().encode(`${file.name}:${file.size}`);
    
    // Encrypt
    const encrypted = aead_encrypt(key, nonce, data, aad);
    
    return {
        key: key.to_bytes(),
        nonce: nonce.to_bytes(),
        encrypted,
        metadata: { filename: file.name, size: file.size }
    };
}

async function decryptFile(encryptedData, keyBytes, nonceBytes, metadata) {
    const key = EncryptionKey.from_bytes(keyBytes);
    const nonce = Nonce.from_bytes(nonceBytes);
    const aad = new TextEncoder().encode(`${metadata.filename}:${metadata.size}`);
    
    const decrypted = aead_decrypt(key, nonce, encryptedData, aad);
    
    if (decrypted) {
        return new File([decrypted], metadata.filename);
    }
    return null;
}
```

## Deriving Keys from Passwords

```javascript
import { generate_user_keys } from './echo_wasm';

// Use the auth system to derive a key from a password
const userKeys = generate_user_keys("user_password_123", new Uint8Array(32));
const publicKeys = userKeys.public_keys();

// Use the user ID as a deterministic key derivation
const userId = publicKeys.derive_id();

// Combine with a salt to derive an encryption key
async function deriveKeyFromPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    
    // Use Web Crypto API to derive key
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        data,
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        512 // 64 bytes
    );
    
    return EncryptionKey.from_bytes(new Uint8Array(derivedBits));
}
```

## Security Best Practices

### 1. Nonce Management

```javascript
// ALWAYS generate a fresh nonce for each encryption
const nonce = Nonce.generate();

// Store nonce with ciphertext (it's not secret)
const package = {
    nonce: nonce.to_bytes(),
    ciphertext: ciphertext
};
```

### 2. Key Storage

```javascript
// NEVER store keys in localStorage (use Web Crypto API instead)
async function storeKey(key) {
    // Import into Web Crypto
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key.to_bytes(),
        { name: "AES-GCM" },
        false, // not extractable
        ["encrypt", "decrypt"]
    );
    
    return cryptoKey;
}
```

### 3. AAD for Context Binding

```javascript
// Use AAD to bind encryption to specific context
function encryptWithContext(message, userId, sessionId, timestamp) {
    const key = EncryptionKey.generate();
    const nonce = Nonce.generate();
    
    const context = JSON.stringify({ userId, sessionId, timestamp });
    const aad = new TextEncoder().encode(context);
    
    return aead_encrypt(key, nonce, message, aad);
}
```

## AES-256-SIV Properties

- **Nonce-Misuse Resistance**: Reusing a nonce only leaks if plaintexts are identical
- **Deterministic with same inputs**: Same key + nonce + plaintext + AAD = same ciphertext
- **Authentication**: Built-in tampering detection
- **No padding oracle**: Ciphertext length is padded to AES block size
- **Post-quantum resistant**: AES-256 remains secure against quantum computers

## Common Pitfalls

### ❌ Wrong: Reusing keys without fresh nonces
```javascript
const key = EncryptionKey.generate();
const nonce = Nonce.generate(); // ONLY GENERATED ONCE

const ct1 = aead_encrypt(key, nonce, msg1, aad); // ⚠️
const ct2 = aead_encrypt(key, nonce, msg2, aad); // ⚠️ Nonce reuse!
```

### ✅ Correct: Fresh nonce per encryption
```javascript
const key = EncryptionKey.generate();

const nonce1 = Nonce.generate();
const ct1 = aead_encrypt(key, nonce1, msg1, aad);

const nonce2 = Nonce.generate();
const ct2 = aead_encrypt(key, nonce2, msg2, aad);
```

### ❌ Wrong: Forgetting AAD during decryption
```javascript
const aad = new TextEncoder().encode("context");
const ct = aead_encrypt(key, nonce, message, aad);

const decrypted = aead_decrypt(key, nonce, ct, new Uint8Array(0)); // ❌ Wrong AAD!
console.log(decrypted); // null
```

### ✅ Correct: Matching AAD
```javascript
const aad = new TextEncoder().encode("context");
const ct = aead_encrypt(key, nonce, message, aad);

const decrypted = aead_decrypt(key, nonce, ct, aad); // ✅ Same AAD
```

