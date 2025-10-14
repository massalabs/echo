// Common encryption parameters
export const ENCRYPTION = {
  PBKDF2: {
    iterations: 150000 as const,
    hash: 'SHA-256' as const,
    saltBytes: 16 as const,
  },
  AES_GCM: {
    keyLength: 256 as const,
    ivBytes: 12 as const,
  },
} as const;

export async function deriveKey(
  password: string,
  salt?: Uint8Array
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const actualSalt =
    salt || crypto.getRandomValues(new Uint8Array(ENCRYPTION.PBKDF2.saltBytes));
  const iterations = ENCRYPTION.PBKDF2.iterations;
  const hash = ENCRYPTION.PBKDF2.hash;
  const keyLength = ENCRYPTION.AES_GCM.keyLength;

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: actualSalt as BufferSource, iterations, hash },
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    ),
    { name: 'AES-GCM', length: keyLength },
    false,
    ['encrypt', 'decrypt']
  );

  return { key, salt: actualSalt };
}

export async function encryptPrivateKey(
  privateKey: BufferSource,
  password: string
): Promise<{
  encryptedPrivateKey: ArrayBuffer;
  iv: Uint8Array;
  salt: Uint8Array;
}> {
  // Generate IV for encryption
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION.AES_GCM.ivBytes));

  // Derive encryption key using your deriveKey function
  const { key: encKey, salt } = await deriveKey(password);

  // Encrypt the private key
  const encryptedPrivateKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encKey,
    privateKey
  );

  return {
    encryptedPrivateKey,
    iv,
    salt,
  };
}

// Decrypts the encrypted private key with AES-GCM. Throws on failure.
export async function decryptPrivateKey(
  encryptedPrivateKey: ArrayBuffer,
  iv: Uint8Array,
  key: CryptoKey
): Promise<ArrayBuffer> {
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encryptedPrivateKey as BufferSource
  );
}

export async function encryptMnemonic(
  plaintext: string,
  key: CryptoKey
): Promise<{ encryptedMnemonic: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION.AES_GCM.ivBytes));
  const enc = new TextEncoder().encode(plaintext);
  const encryptedMnemonic = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc
  );
  return { encryptedMnemonic, iv };
}

export async function decryptMnemonic(
  encryptedMnemonic: ArrayBuffer,
  iv: Uint8Array,
  key: CryptoKey
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encryptedMnemonic
  );
  return new TextDecoder().decode(plain);
}
