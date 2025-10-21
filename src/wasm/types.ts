/**
 * WASM Module Type Definitions
 *
 * This file contains all the TypeScript interfaces and types
 * for the WASM crypto modules.
 */

// Core WASM module interface
export interface WasmModule {
  init(): Promise<void>;
  cleanup(): void;
}

// Session module interface
export interface SessionModule extends WasmModule {
  // Session management
  createSession(sessionId: string): Promise<void>;
  destroySession(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<Session | null>;

  // High-level session operations
  createOutgoingSession(
    contactId: string,
    recipientPublicKey: Uint8Array
  ): Promise<SessionInitiationResult>;
  feedIncomingAnnouncement(
    announcementData: Uint8Array
  ): Promise<SessionInitiationResult>;

  // Message handling
  createMessage(sessionId: string, content: string): Promise<Message>;
  decryptMessage(
    sessionId: string,
    encryptedMessage: Uint8Array
  ): Promise<string>;

  // Key management
  generateKeyPair(): Promise<KeyPair>;
  deriveKeys(masterKey: Uint8Array, context: string): Promise<DerivedKeys>;
}

// Data structures
export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface DerivedKeys {
  masterKey: Uint8Array;
  encryptionKey: Uint8Array;
  nonce: Uint8Array;
  integrityKey: Uint8Array;
}

export interface Session {
  id: string;
  masterKey: Uint8Array;
  innerKey: Uint8Array;
  nextPublicKey: Uint8Array;
  nextPrivateKey: Uint8Array;
  version: number;
  status: 'pending' | 'active' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  sessionId: string;
  content: string;
  ciphertext: Uint8Array;
  ct: Uint8Array;
  rand: Uint8Array;
  nonce: Uint8Array;
  messageType: 'initiation' | 'response' | 'regular';
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
}

export interface SessionInitiationResult {
  sessionId: string;
  postData: {
    ct: Uint8Array;
    rand: Uint8Array;
    ciphertext: Uint8Array;
  };
  transactionHash: string;
  session: Session;
}

// User ID derivation module interface
export interface UserIdModule extends WasmModule {
  /**
   * Derive a user ID from Massa public key and other parameters
   * @param publicKey - The Massa public key (Uint8Array)
   * @param username - The username string
   * @param additionalParams - Additional parameters for derivation (optional)
   * @returns The derived 32-byte user ID as hex string
   */
  deriveUserId(
    publicKey: Uint8Array,
    username: string,
    additionalParams?: Uint8Array
  ): Promise<string>;
}
