/**
 * Auth Service
 *
 * Handles storing and retrieving public keys by userId hash via the auth API.
 */

import { UserPublicKeys } from '../assets/generated/wasm/gossip_wasm';
import { decodeUserId } from '../utils/userId';
import { encodeToBase64, decodeFromBase64 } from '../utils/base64';
import { IMessageProtocol } from '../api/messageProtocol/types';
import { createMessageProtocol } from '../api/messageProtocol';

interface PublicKeyResult {
  success: boolean;
  publicKey?: UserPublicKeys;
  error?: string;
}

export class AuthService {
  constructor(public readonly messageProtocol: IMessageProtocol) {}

  /**
   * Fetch public key by userId
   * @param userId - Bech32-encoded userId (e.g., "gossip1...")
   */
  async fetchPublicKeyByUserId(userId: string): Promise<PublicKeyResult> {
    try {
      const base64PublicKey = await this.messageProtocol.fetchPublicKeyByUserId(
        decodeUserId(userId)
      );

      if (!base64PublicKey) {
        return { success: false, error: 'Public key not found' };
      }

      return {
        success: true,
        publicKey: UserPublicKeys.from_bytes(decodeFromBase64(base64PublicKey)),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch public key',
      };
    }
  }

  /**
   * Post public key to the API
   * @param publicKeys - UserPublicKeys instance to store
   */
  async postPublicKey(publicKeys: UserPublicKeys): Promise<void> {
    try {
      await this.messageProtocol.postPublicKey(
        encodeToBase64(publicKeys.to_bytes())
      );
    } catch (e) {
      // TODO: What if error
      // TODO:  Handle retry
      console.log(e);
    }
  }

  /**
   * Ensure public key is published (check first, then publish if needed)
   * @param publicKeys - UserPublicKeys instance
   * @param userId - Bech32-encoded userId (e.g., "gossip1...")
   */
  async ensurePublicKeyPublished(
    publicKeys: UserPublicKeys,
    userId: string
  ): Promise<void> {
    // TODO: Add published auth key ? TLS ? when do we reniew, check for every connection, when sending userId ? Both, check every minutes
    const result = await this.fetchPublicKeyByUserId(userId);
    if (result.success) return;

    // TODO: if error what do do ? Retry ?
    await this.postPublicKey(publicKeys);
  }
}

export const authService = new AuthService(createMessageProtocol());
