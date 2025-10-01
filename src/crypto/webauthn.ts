/**
 * WebAuthn/FIDO2 utilities for biometric authentication and key generation
 */

export interface WebAuthnCredential {
  id: string;
  publicKey: ArrayBuffer;
  counter: number;
  deviceType: 'platform' | 'cross-platform';
  backedUp: boolean;
  transports?: AuthenticatorTransport[];
}

export interface WebAuthnKeyMaterial {
  credentialId: string;
  publicKey: ArrayBuffer;
  privateKey: CryptoKey;
  counter: number;
  deviceType: 'platform' | 'cross-platform';
  backedUp: boolean;
  transports?: AuthenticatorTransport[];
}

/**
 * Check if WebAuthn is supported in the current browser
 */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    typeof window.navigator.credentials !== 'undefined' &&
    typeof window.navigator.credentials.create !== 'undefined' &&
    typeof window.navigator.credentials.get !== 'undefined' &&
    typeof (window as unknown as { PublicKeyCredential?: unknown })
      .PublicKeyCredential !== 'undefined'
  );
}

/**
 * Check if platform authenticator (biometric) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    return false;
  }

  try {
    const pkc = window.PublicKeyCredential as unknown as {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean>;
    };
    if (
      !pkc ||
      typeof pkc.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
    ) {
      return false;
    }
    const available = await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (error) {
    console.error('Error checking platform authenticator availability:', error);
    return false;
  }
}

/**
 * Generate a new WebAuthn credential for account creation
 */
export async function createWebAuthnCredential(
  username: string
): Promise<WebAuthnKeyMaterial> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser');
  }

  const isPlatformAvailable = await isPlatformAuthenticatorAvailable();
  if (!isPlatformAvailable) {
    throw new Error('Platform authenticator (biometric) is not available');
  }

  // Generate a random challenge
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  // Create credential creation options
  const createOptions: CredentialCreationOptions = {
    publicKey: {
      challenge,
      rp: {
        name: 'Echo',
        id: window.location.hostname,
      },
      user: {
        id: new TextEncoder().encode(username),
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256 (ECDSA P-256)
        { type: 'public-key', alg: -257 }, // RS256 (RSASSA-PKCS1-v1_5 with SHA-256)
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Force platform authenticator (biometric)
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000, // 60 seconds
      attestation: 'none', // We don't need attestation for our use case
    },
  };

  try {
    const credential = (await navigator.credentials.create(
      createOptions
    )) as PublicKeyCredential;

    if (!credential) {
      throw new Error('Failed to create WebAuthn credential');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const publicKey = response.getPublicKey();

    if (!publicKey) {
      throw new Error('No public key in credential response');
    }

    // Note: We don't need to import the public key for our use case
    // since we're deriving our own encryption key from the credential

    // For WebAuthn, we can't directly access the private key
    // Instead, we'll use the credential for authentication and derive a separate encryption key
    const encryptionKey = await deriveEncryptionKeyFromCredential(credential);

    // Convert credentialId to base64url for storage
    const credentialIdArray = new Uint8Array(credential.rawId);
    const base64url = btoa(String.fromCharCode(...credentialIdArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return {
      credentialId: base64url, // Store as base64url string
      publicKey: publicKey,
      privateKey: encryptionKey, // This is actually our derived encryption key
      counter: 0, // Will be updated on each use
      deviceType: 'platform',
      backedUp: false,
      transports: (
        credential.response as AuthenticatorAttestationResponse
      ).getTransports?.() as AuthenticatorTransport[],
    };
  } catch (error) {
    console.error('Error creating WebAuthn credential:', error);
    throw new Error(
      `Failed to create biometric credential: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Authenticate using existing WebAuthn credential
 */
export async function authenticateWithWebAuthn(
  credentialId: string,
  challenge?: Uint8Array
): Promise<WebAuthnKeyMaterial> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser');
  }

  const actualChallenge =
    challenge || crypto.getRandomValues(new Uint8Array(32));

  // Convert credentialId from base64url string back to ArrayBuffer
  let credentialIdBuffer: ArrayBuffer;
  try {
    // First try to decode as base64url (standard WebAuthn format)
    const base64url = credentialId.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
    const binaryString = atob(padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    credentialIdBuffer = bytes.buffer;
  } catch (error) {
    // If base64url decoding fails, try treating as raw string
    console.warn(
      'Failed to decode credentialId as base64url, trying as raw string:',
      error
    );
    credentialIdBuffer = new TextEncoder().encode(credentialId).buffer;
  }

  const getOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: actualChallenge as BufferSource,
      allowCredentials: [
        {
          id: credentialIdBuffer,
          type: 'public-key',
          // Remove transports restriction to allow both internal and external authenticators
          // transports: ['internal'], // This was too restrictive
        },
      ],
      userVerification: 'required',
      timeout: 60000,
      // Add rpId to match the one used during creation
      rpId: window.location.hostname,
    },
  };

  try {
    console.log(
      'Attempting WebAuthn authentication with credentialId:',
      credentialId
    );
    console.log('Using RP ID:', window.location.hostname);

    const credential = (await navigator.credentials.get(
      getOptions
    )) as PublicKeyCredential;

    if (!credential) {
      throw new Error('Authentication failed - no credential returned');
    }

    console.log('WebAuthn authentication successful');

    const response = credential.response as AuthenticatorAssertionResponse;
    const publicKey = response.authenticatorData;

    if (!publicKey) {
      throw new Error('No authenticator data in response');
    }

    // Derive encryption key from the credential
    const encryptionKey = await deriveEncryptionKeyFromCredential(credential);

    return {
      credentialId: credential.id,
      publicKey: publicKey,
      privateKey: encryptionKey,
      counter: 0, // This would need to be stored and updated
      deviceType: 'platform',
      backedUp: false,
    };
  } catch (error) {
    console.error('Error authenticating with WebAuthn:', error);
    console.error('CredentialId used:', credentialId);
    console.error('RP ID used:', window.location.hostname);
    throw new Error(
      `Biometric authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Derive an encryption key from a WebAuthn credential
 * Since we can't access the private key directly, we'll use the credential ID
 * and some deterministic data to derive a consistent encryption key
 */
async function deriveEncryptionKeyFromCredential(
  credential: PublicKeyCredential
): Promise<CryptoKey> {
  // Create a deterministic seed from the credential ID and some app-specific data
  const credentialIdBuffer = new TextEncoder().encode(credential.id);
  const appSalt = new TextEncoder().encode('echo-app-salt-2024');

  // Combine credential ID with app salt
  const combined = new Uint8Array(credentialIdBuffer.length + appSalt.length);
  combined.set(credentialIdBuffer);
  combined.set(appSalt, credentialIdBuffer.length);

  // Derive key using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    combined,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const salt = new Uint8Array(16); // Fixed salt for consistency
  const iterations = 100000;

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt private key using WebAuthn-derived encryption key
 */
export async function encryptPrivateKeyWithWebAuthn(
  privateKey: BufferSource,
  webauthnKey: WebAuthnKeyMaterial
): Promise<{
  encryptedKey: ArrayBuffer;
  iv: Uint8Array;
  credentialId: string;
}> {
  // Generate IV for encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the private key
  const encryptedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    webauthnKey.privateKey,
    privateKey
  );

  return {
    encryptedKey,
    iv,
    credentialId: webauthnKey.credentialId,
  };
}

/**
 * Decrypt private key using WebAuthn-derived encryption key
 */
export async function decryptPrivateKeyWithWebAuthn(
  encryptedKey: ArrayBuffer,
  iv: Uint8Array,
  webauthnKey: WebAuthnKeyMaterial
): Promise<ArrayBuffer> {
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    webauthnKey.privateKey,
    encryptedKey
  );
}
