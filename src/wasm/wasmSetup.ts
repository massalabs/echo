/**
 * WebAssembly setup and initialization for Echo app
 */

import init, {
  EncryptionKey,
  Nonce,
  aead_encrypt,
  aead_decrypt,
  generate_user_keys,
  start,
} from '../../wasm/build/echo_wasm.js';

let wasmInitialized = false;

/**
 * Initialize the WebAssembly module
 * This must be called before using any WASM functions
 */
export async function initializeWasm(): Promise<void> {
  if (wasmInitialized) {
    console.log('WASM already initialized');
    return;
  }

  try {
    console.log('Initializing WebAssembly module...');

    // Initialize the WASM module
    await init();

    // Call the start function to set up the module
    start();

    wasmInitialized = true;
    console.log('✅ WebAssembly module initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize WebAssembly:', error);
    throw new Error(`WASM initialization failed: ${error}`);
  }
}

/**
 * Check if WASM is initialized
 */
export function isWasmInitialized(): boolean {
  return wasmInitialized;
}

/**
 * Simple test function to verify WASM is working
 */
export async function testWasm(): Promise<boolean> {
  if (!wasmInitialized) {
    throw new Error('WASM not initialized. Call initializeWasm() first.');
  }

  try {
    console.log('🧪 Testing WASM functionality...');

    // Test 1: Generate encryption key
    const key = EncryptionKey.generate();
    console.log('✅ Generated encryption key:', key.to_bytes().length, 'bytes');

    // Test 2: Generate nonce
    const nonce = Nonce.generate();
    console.log('✅ Generated nonce:', nonce.to_bytes().length, 'bytes');

    // Test 3: Simple encryption/decryption
    const plaintext = new TextEncoder().encode('Hello from WASM!');
    const aad = new TextEncoder().encode('test-context');

    const ciphertext = aead_encrypt(key, nonce, plaintext, aad);
    console.log('✅ Encrypted message:', ciphertext.length, 'bytes');

    const decrypted = aead_decrypt(key, nonce, ciphertext, aad);
    if (decrypted) {
      const decryptedText = new TextDecoder().decode(decrypted);
      console.log('✅ Decrypted message:', decryptedText);

      // Clean up
      key.free();
      nonce.free();

      return decryptedText === 'Hello from WASM!';
    } else {
      console.error('❌ Decryption failed');
      return false;
    }
  } catch (error) {
    console.error('❌ WASM test failed:', error);
    return false;
  }
}

/**
 * Generate user keys for testing
 */
export async function testUserKeys(passphrase: string): Promise<void> {
  if (!wasmInitialized) {
    throw new Error('WASM not initialized. Call initializeWasm() first.');
  }

  try {
    console.log('🔑 Testing user key generation...');

    // Create a dummy secondary public key (32 bytes)
    const secondaryPublicKey = new Uint8Array(32);
    crypto.getRandomValues(secondaryPublicKey);

    const userKeys = generate_user_keys(passphrase, secondaryPublicKey);
    console.log('✅ Generated user keys');

    const publicKeys = userKeys.public_keys();
    const secretKeys = userKeys.secret_keys();

    console.log('✅ Public keys bytes:', publicKeys.to_bytes().length);
    console.log('✅ Secret keys bytes:', secretKeys.to_bytes().length);

    // Clean up
    userKeys.free();
    publicKeys.free();
    secretKeys.free();
  } catch (error) {
    console.error('❌ User key generation test failed:', error);
    throw error;
  }
}
