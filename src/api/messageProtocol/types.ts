/**
 * Message Protocol Types and Interfaces
 */

export interface EncryptedMessage {
  seeker: Uint8Array;
  ciphertext: Uint8Array;
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
  sendMessage(seeker: Uint8Array, message: EncryptedMessage): Promise<void>;

  /**
   * Broadcast an outgoing session announcement produced by WASM.
   * Returns the bulletin counter provided by the API.
   */
  sendAnnouncement(announcement: Uint8Array): Promise<string>;

  /**
   * Fetch incoming discussion announcements from the bulletin storage.
   * Returns raw announcement bytes as provided by the API.
   */
  fetchAnnouncements(): Promise<Uint8Array[]>;
}
