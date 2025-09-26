export async function deriveKey(
  password: string,
  salt?: Uint8Array
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const actualSalt = salt || crypto.getRandomValues(new Uint8Array(16));
  const iterations = 150000;
  const hash = 'SHA-256';
  const keyLength = 256;

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
  encryptedKey: ArrayBuffer;
  iv: Uint8Array;
  salt: Uint8Array;
  kdf: { name: 'PBKDF2'; iterations: 150000; hash: 'SHA-256' };
}> {
  // Generate IV for encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive encryption key using your deriveKey function
  const { key: encKey, salt } = await deriveKey(password);

  // Encrypt the private key
  const encryptedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encKey,
    privateKey
  );

  return {
    encryptedKey,
    iv,
    salt,
    kdf: { name: 'PBKDF2', iterations: 150000, hash: 'SHA-256' },
  };
}
