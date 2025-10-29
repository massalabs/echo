/**
 * Message Protocol Types and Interfaces
 */

export interface EncryptedMessage {
  id: string;
  seeker: Uint8Array;
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
   * Fetch encrypted messages for the provided set of seeker read keys
   */
  fetchMessages(seekers: Uint8Array[]): Promise<EncryptedMessage[]>;

  /**
   * Send an encrypted message to the key-value store
   */
  sendMessage(discussionKey: string, message: EncryptedMessage): Promise<void>;

  /**
   * Broadcast an outgoing session announcement produced by WASM
   */
  createOutgoingSession(announcement: Uint8Array): Promise<void>;

  /**
   * Broadcast an incoming session response produced by WASM
   */
  feedIncomingAnnouncement(announcement: Uint8Array): Promise<void>;

  /**
   * Fetch incoming discussion announcements
   */
  fetchAnnouncements(): Promise<Uint8Array[]>;
}
