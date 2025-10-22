/**
 * Message Protocol Types and Interfaces
 */

import { SessionInitiationResult } from '../../wasm/types';

export interface EncryptedMessage {
  id: string;
  ciphertext: Uint8Array;
  ct: Uint8Array;
  rand: Uint8Array;
  nonce: Uint8Array;
  messageType: 'initiation' | 'response' | 'regular';
  direction: 'incoming' | 'outgoing';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface MessageProtocolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Abstract interface for message protocol operations
 */
export interface IMessageProtocol {
  /**
   * Fetch encrypted messages from the key-value store for a discussion
   */
  fetchMessages(discussionKey: string): Promise<EncryptedMessage[]>;

  /**
   * Send an encrypted message to the key-value store
   */
  sendMessage(discussionKey: string, message: EncryptedMessage): Promise<void>;

  /**
   * Create an outgoing session with a contact
   */
  createOutgoingSession(
    contactId: string,
    recipientPublicKey: Uint8Array
  ): Promise<SessionInitiationResult>;

  /**
   * Process an incoming session announcement
   */
  feedIncomingAnnouncement(
    announcementData: Uint8Array
  ): Promise<SessionInitiationResult>;

  /**
   * Fetch incoming discussion announcements
   */
  fetchAnnouncements(): Promise<Uint8Array[]>;
}
