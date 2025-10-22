/**
 * Session Module Implementation
 *
 * This file contains the mock implementation of the SessionModule.
 * In production, this would be replaced with actual WASM module calls.
 */

import {
  SessionModule,
  Session,
  Message,
  KeyPair,
  DerivedKeys,
  SessionInitiationResult,
} from './types';

export class MockSessionModule implements SessionModule {
  private sessions: Map<string, Session> = new Map();

  async init(): Promise<void> {
    console.log('Mock session module initialized');
  }

  cleanup(): void {
    this.sessions.clear();
  }

  async createSession(sessionId: string): Promise<void> {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const discussionKey = this.generateDiscussionKey(masterKey);

    this.sessions.set(sessionId, {
      id: sessionId,
      masterKey,
      innerKey: crypto.getRandomValues(new Uint8Array(32)),
      nextPublicKey: crypto.getRandomValues(new Uint8Array(1184)),
      nextPrivateKey: crypto.getRandomValues(new Uint8Array(2400)),
      version: 1,
      status: 'pending',
      discussionKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async destroySession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) || null;
  }

  async createMessage(sessionId: string, content: string): Promise<Message> {
    return {
      id: crypto.randomUUID(),
      sessionId,
      content,
      ciphertext: crypto.getRandomValues(new Uint8Array(32)),
      ct: crypto.getRandomValues(new Uint8Array(32)),
      rand: crypto.getRandomValues(new Uint8Array(32)),
      nonce: crypto.getRandomValues(new Uint8Array(12)),
      messageType: 'regular',
      direction: 'outgoing',
      status: 'pending',
      timestamp: new Date(),
    };
  }

  async decryptMessage(
    _sessionId: string,
    _encryptedMessage: Uint8Array
  ): Promise<string> {
    return 'Decrypted message content';
  }

  async generateKeyPair(): Promise<KeyPair> {
    return {
      publicKey: crypto.getRandomValues(new Uint8Array(1184)),
      privateKey: crypto.getRandomValues(new Uint8Array(2400)),
    };
  }

  async deriveKeys(
    _masterKey: Uint8Array,
    _context: string
  ): Promise<DerivedKeys> {
    return {
      masterKey: crypto.getRandomValues(new Uint8Array(32)),
      encryptionKey: crypto.getRandomValues(new Uint8Array(32)),
      nonce: crypto.getRandomValues(new Uint8Array(12)),
      integrityKey: crypto.getRandomValues(new Uint8Array(32)),
    };
  }

  async createOutgoingSession(
    contactId: string,
    _recipientPublicKey: Uint8Array
  ): Promise<SessionInitiationResult> {
    const sessionId = `session_${contactId}_${Date.now()}`;

    // Create the session
    await this.createSession(sessionId);
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new Error('Failed to create session');
    }

    // Mock post data for blockchain
    const postData = {
      ct: crypto.getRandomValues(new Uint8Array(1088)),
      rand: crypto.getRandomValues(new Uint8Array(32)),
      ciphertext: crypto.getRandomValues(new Uint8Array(256)),
    };

    // Mock transaction hash
    const transactionHash =
      '0x' +
      crypto
        .getRandomValues(new Uint8Array(32))
        .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');

    return {
      sessionId,
      postData,
      transactionHash,
      session,
    };
  }

  async feedIncomingAnnouncement(
    _announcementData: Uint8Array
  ): Promise<SessionInitiationResult> {
    // Mock processing of incoming announcement
    const sessionId = `incoming_session_${Date.now()}`;

    // Create the session
    await this.createSession(sessionId);
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new Error('Failed to create session from announcement');
    }

    // Mock post data (would be extracted from announcement)
    const postData = {
      ct: crypto.getRandomValues(new Uint8Array(1088)),
      rand: crypto.getRandomValues(new Uint8Array(32)),
      ciphertext: crypto.getRandomValues(new Uint8Array(256)),
    };

    // Mock transaction hash
    const transactionHash =
      '0x' +
      crypto
        .getRandomValues(new Uint8Array(32))
        .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');

    return {
      sessionId,
      postData,
      transactionHash,
      session,
    };
  }

  /**
   * Generate a discussion key from the master key
   * This key is used to access messages in the protocol's key-value store
   */
  private generateDiscussionKey(masterKey: Uint8Array): string {
    // Convert master key to hex string and hash it for a consistent key
    const hexKey = Array.from(masterKey)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');

    // Create a simple hash-based key (in production, this would use proper crypto)
    return `discussion_${hexKey.substring(0, 16)}`;
  }
}
