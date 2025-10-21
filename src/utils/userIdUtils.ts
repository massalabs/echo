/**
 * User ID utility functions
 *
 * This module provides functions for deriving user IDs from Massa public keys
 * using the WASM module system.
 */

import { PublicKey } from '@massalabs/massa-web3';
import { wasmLoader, UserIdModule } from '../wasm';

/**
 * Initialize WASM modules for user ID derivation
 */
export async function initializeUserIdModules(): Promise<void> {
  await wasmLoader.loadModules();
}

/**
 * Get the user ID module
 */
function getUserIdModule(): UserIdModule {
  return wasmLoader.getModule<UserIdModule>('userId');
}

/**
 * Derive a user ID from Massa public key and username
 * @param publicKey - The Massa public key as Uint8Array
 * @param username - The username string
 * @param additionalParams - Additional parameters for derivation (optional)
 * @returns The derived 32-byte user ID as hex string
 */
export async function deriveUserId(
  publicKey: Uint8Array,
  username: string,
  additionalParams?: Uint8Array
): Promise<string> {
  try {
    await initializeUserIdModules();
    const userIdModule = getUserIdModule();
    return await userIdModule.deriveUserId(
      publicKey,
      username,
      additionalParams
    );
  } catch (error) {
    console.error('Failed to derive user ID:', error);
    throw new Error('User ID derivation failed');
  }
}

/**
 * Derive a user ID from Massa public key string and username
 * @param publicKeyString - The Massa public key as string
 * @param username - The username string
 * @param additionalParams - Additional parameters for derivation (optional)
 * @returns The derived 32-byte user ID as hex string
 */
export async function createUserId(
  publicKeyString: string,
  username: string,
  additionalParams?: Uint8Array
): Promise<string> {
  const publicKeyBytes = PublicKey.fromString(publicKeyString).toBytes();
  return deriveUserId(publicKeyBytes, username, additionalParams);
}
