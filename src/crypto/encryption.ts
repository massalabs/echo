import {
  decryptAead,
  encryptAead,
  EncryptionKey,
  generateNonce,
  Nonce,
} from '../wasm/encryption';

export async function encrypt(
  plaintext: string,
  key: EncryptionKey
): Promise<{ encryptedData: Uint8Array; nonce: Uint8Array }> {
  const nonce = await generateNonce();
  const encryptedData = await encryptAead(
    key,
    nonce,
    new TextEncoder().encode(plaintext),
    new Uint8Array()
  );
  return { encryptedData, nonce: nonce.to_bytes() };
}

export async function decrypt(
  encryptedData: Uint8Array,
  nonce: Uint8Array,
  key: EncryptionKey
): Promise<string> {
  const plain = await decryptAead(
    key,
    Nonce.from_bytes(nonce),
    encryptedData,
    new Uint8Array()
  );
  if (!plain) {
    throw new Error('Failed to decrypt data');
  }
  return new TextDecoder().decode(plain);
}

export async function deriveKey(
  seedString: string,
  nonce: Uint8Array
): Promise<EncryptionKey> {
  return await EncryptionKey.from_seed(seedString, nonce);
}
