import { db, UserProfile } from '../../db';
import { decryptPrivateKey } from '../../crypto/encryption';
import { useAccountStore } from '../accountStore';
import {
  UserPublicKeys,
  UserSecretKeys,
} from '../../assets/generated/wasm/echo_wasm';

type DecryptedWasmKeys = {
  ourPk: UserPublicKeys;
  ourSk: UserSecretKeys;
  profile: UserProfile;
};

/**
 * Helper function to get WASM keys from account store and decrypt secret keys.
 *
 * Fetches the encryption key from the account store, loads the user profile,
 * and decrypts the WASM secret keys to return both public and secret keys.
 *
 * @returns Decrypted WASM keys (public and secret) along with the profile
 * @throws Error if profile, WASM keys, or encryption key are not available
 */
export async function getDecryptedWasmKeys(): Promise<DecryptedWasmKeys> {
  const state = useAccountStore.getState();
  const encryptionKey = state.encryptionKey;
  let profile = state.userProfile;

  if (!profile) {
    profile = (await db.userProfile.toCollection().first()) || null;
  }

  if (!profile) {
    throw new Error('User profile not found');
  }

  if (!profile.wasmKeys) {
    throw new Error('WASM keys not found in user profile');
  }

  if (!encryptionKey) {
    throw new Error('Encryption key not available');
  }

  const ourPk = UserPublicKeys.from_bytes(profile.wasmKeys.publicKeys);
  const rawSecret = new Uint8Array(
    await decryptPrivateKey(
      profile.wasmKeys.encryptedSecretKeys,
      profile.wasmKeys.secretKeysIv,
      encryptionKey
    )
  );
  const ourSk = UserSecretKeys.from_bytes(rawSecret);

  return { ourPk, ourSk, profile };
}
