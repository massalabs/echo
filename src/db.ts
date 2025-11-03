import Dexie, { Table } from 'dexie';

// Define interfaces for your data models
export interface Contact {
  userId: string; // 32-byte user ID (base58 encoded) - primary key
  name: string;
  userPublicKeys: Uint8Array;
  avatar?: string;
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
}

export interface Message {
  id?: number;
  contactUserId: string; // Reference to Contact.userId
  content: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'video';
  direction: 'incoming' | 'outgoing';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  encrypted: boolean;
  metadata?: Record<string, unknown>;
}

export interface DiscussionThread {
  id?: number;
  contactUserId: string; // Reference to Contact.userId
  lastMessageId?: number;
  lastMessageContent: string;
  lastMessageTimestamp: Date;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  userId: string; // 32-byte user ID (base58 encoded) - primary key
  username: string;
  avatar?: string;
  wallet: {
    address: string;
    publicKey: string;
  };
  // WASM user keys (serialized)
  wasmKeys: {
    publicKeys: Uint8Array; // bytes from UserPublicKeys.to_bytes()
    encryptedSecretKeys: ArrayBuffer; // AES-GCM encrypted bytes from UserSecretKeys.to_bytes()
    secretKeysIv: Uint8Array; // IV used for encryption of secret keys
  };
  // Security-related fields (encryption and authentication)
  security: {
    // Encrypted Massa private key (AES-GCM)
    encryptedPrivateKey: ArrayBuffer;
    iv: Uint8Array;

    // WebAuthn/FIDO2 (biometric) details when used
    webauthn?: {
      credentialId: string;
      publicKey: ArrayBuffer;
      counter: number;
      deviceType: 'platform' | 'cross-platform';
      backedUp: boolean;
      transports?: string[];
    };

    // Password-based KDF parameters when used
    password?: {
      salt: Uint8Array;
      kdf: { name: 'PBKDF2'; iterations: 150000; hash: 'SHA-256' };
    };

    // Mnemonic backup details
    mnemonicBackup?: {
      encryptedMnemonic: ArrayBuffer;
      iv: Uint8Array;
      createdAt: Date;
      backedUp: boolean;
    };
  };
  bio?: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Settings {
  id?: number;
  key: string;
  value: unknown;
  updatedAt: Date;
}

// New interfaces for discussion initialization
export interface Discussion {
  id?: number;
  contactUserId: string; // Reference to Contact.userId
  direction: 'initiated' | 'received'; // Whether this user initiated or received the discussion
  status: 'pending' | 'active' | 'closed';
  nextSeeker?: Uint8Array; // The next seeker for sending messages (from SendMessageOutput)
  version: number;
  discussionKey: string; // Key for accessing messages in the key-value store
  lastSyncTimestamp?: Date; // Last time messages were synced from protocol
  createdAt: Date;
  updatedAt: Date;
}

export interface DiscussionKey {
  id?: number;
  discussionId: number;
  publicKey: Uint8Array; // Kyber public key
  privateKey: Uint8Array; // Kyber private key (encrypted)
  isActive: boolean;
  createdAt: Date;
}

export interface DiscussionMessage {
  id?: number;
  discussionId: number;
  messageType: 'initiation' | 'response' | 'regular';
  direction: 'incoming' | 'outgoing';
  ciphertext: Uint8Array; // Encrypted message content
  ct: Uint8Array; // Kyber ciphertext
  rand: Uint8Array; // Random number for derivation
  nonce: Uint8Array; // AES nonce
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// Define the database class
export class EchoDatabase extends Dexie {
  // Define tables
  contacts!: Table<Contact>;
  messages!: Table<Message>;
  discussionThreads!: Table<DiscussionThread>;
  userProfile!: Table<UserProfile>;
  settings!: Table<Settings>;
  discussions!: Table<Discussion>;
  discussionKeys!: Table<DiscussionKey>;
  discussionMessages!: Table<DiscussionMessage>;

  constructor() {
    super('EchoDatabase');

    // Define schema with userId as primary key for contacts and userProfile
    this.version(3).stores({
      contacts: 'userId, name, isOnline, lastSeen, createdAt',
      messages:
        '++id, contactUserId, type, direction, status, timestamp, encrypted, [contactUserId+status]',
      discussionThreads:
        '++id, &contactUserId, lastMessageTimestamp, unreadCount, isPinned, isArchived',
      userProfile: 'userId, username, status, lastSeen',
      settings: '++id, key, updatedAt',
      discussions:
        '++id, contactUserId, direction, status, version, discussionKey, lastSyncTimestamp, createdAt, updatedAt',
      discussionKeys: '++id, discussionId, isActive, createdAt',
      discussionMessages:
        '++id, discussionId, messageType, direction, status, timestamp',
    });

    // Add hooks for automatic timestamps
    this.contacts.hook('creating', function (_primKey, obj, _trans) {
      obj.createdAt = new Date();
    });

    this.discussionThreads.hook('creating', function (_primKey, obj, _trans) {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });

    this.discussionThreads.hook(
      'updating',
      function (modifications, _primKey, _obj, _trans) {
        (modifications as Record<string, unknown>).updatedAt = new Date();
      }
    );

    this.userProfile.hook('creating', function (_primKey, obj, _trans) {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });

    this.userProfile.hook(
      'updating',
      function (modifications, _primKey, _obj, _trans) {
        (modifications as Record<string, unknown>).updatedAt = new Date();
      }
    );

    this.settings.hook('creating', function (_primKey, obj, _trans) {
      obj.updatedAt = new Date();
    });

    this.settings.hook(
      'updating',
      function (modifications, _primKey, _obj, _trans) {
        (modifications as Record<string, unknown>).updatedAt = new Date();
      }
    );

    this.discussions.hook('creating', function (_primKey, obj, _trans) {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });

    this.discussions.hook(
      'updating',
      function (modifications, _primKey, _obj, _trans) {
        (modifications as Record<string, unknown>).updatedAt = new Date();
      }
    );

    this.discussionKeys.hook('creating', function (_primKey, obj, _trans) {
      obj.createdAt = new Date();
    });

    this.discussionMessages.hook('creating', function (_primKey, obj, _trans) {
      obj.timestamp = new Date();
    });
  }

  // Helper methods for common operations
  async getContactByUserId(userId: string): Promise<Contact | undefined> {
    return await this.contacts.where('userId').equals(userId).first();
  }

  async getMessagesForContact(
    contactUserId: string,
    limit = 50
  ): Promise<Message[]> {
    return await this.messages
      .where('contactUserId')
      .equals(contactUserId)
      .reverse()
      .limit(limit)
      .toArray();
  }

  async getDiscussionThreads(): Promise<DiscussionThread[]> {
    return await this.discussionThreads
      .orderBy('lastMessageTimestamp')
      .reverse()
      .toArray();
  }

  async getUnreadCount(): Promise<number> {
    const discussionThreads = await this.discussionThreads.toArray();
    return discussionThreads.reduce(
      (total, thread) => total + thread.unreadCount,
      0
    );
  }

  async markMessagesAsRead(contactUserId: string): Promise<void> {
    await this.messages
      .where(['contactUserId', 'status'])
      .equals([contactUserId, 'delivered'])
      .modify({ status: 'read' });

    await this.discussionThreads
      .where('contactUserId')
      .equals(contactUserId)
      .modify({ unreadCount: 0 });
  }

  async addMessage(message: Omit<Message, 'id'>): Promise<number> {
    console.log('Adding message for contact:', message.contactUserId);
    const messageId = await this.messages.add(message);

    // Get existing discussion thread
    const discussionThread = await this.discussionThreads
      .where('contactUserId')
      .equals(message.contactUserId)
      .first();

    if (discussionThread) {
      console.log('Updating existing discussion thread:', discussionThread.id);
      await this.discussionThreads.update(discussionThread.id!, {
        lastMessageId: messageId,
        lastMessageContent: message.content,
        lastMessageTimestamp: message.timestamp,
        unreadCount:
          message.direction === 'incoming'
            ? discussionThread.unreadCount + 1
            : discussionThread.unreadCount,
        updatedAt: new Date(),
      });
    } else {
      // Create new discussion thread using put to handle unique constraint
      console.log(
        'Creating new discussion thread for contact:',
        message.contactUserId
      );
      await this.discussionThreads.put({
        contactUserId: message.contactUserId,
        lastMessageId: messageId,
        lastMessageContent: message.content,
        lastMessageTimestamp: message.timestamp,
        unreadCount: message.direction === 'incoming' ? 1 : 0,
        isPinned: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(
        'Created/updated discussion thread for contact:',
        message.contactUserId
      );
    }

    return messageId;
  }

  async getSetting(key: string): Promise<unknown> {
    const setting = await this.settings.where('key').equals(key).first();
    return setting?.value;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.settings.put({
      key,
      value,
      updatedAt: new Date(),
    });
  }

  /**
   * Get messages for a discussion since a specific timestamp
   * @param discussionId - The discussion ID
   * @param timestamp - The timestamp to filter from
   * @returns Array of messages newer than the timestamp
   */
  async getMessagesSince(
    discussionId: number,
    timestamp: Date
  ): Promise<DiscussionMessage[]> {
    return await this.discussionMessages
      .where('discussionId')
      .equals(discussionId)
      .filter(msg => msg.timestamp > timestamp)
      .toArray()
      .then(messages =>
        messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      );
  }

  /**
   * Get all active discussions with their sync status
   * @returns Array of active discussions
   */
  async getActiveDiscussions(): Promise<Discussion[]> {
    return await this.discussions.where('status').equals('active').toArray();
  }

  /**
   * Update the last sync timestamp for a discussion
   * @param discussionId - The discussion ID
   * @param timestamp - The sync timestamp
   */
  async updateLastSyncTimestamp(
    discussionId: number,
    timestamp: Date
  ): Promise<void> {
    await this.discussions.update(discussionId, {
      lastSyncTimestamp: timestamp,
      updatedAt: new Date(),
    });
  }
}

// Create and export the database instance
export const db = new EchoDatabase();
