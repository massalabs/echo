import Dexie, { Table } from 'dexie';

// Define interfaces for your data models
export interface Contact {
  id?: number;
  username: string;
  displayName: string;
  avatar?: string;
  publicKey?: string;
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id?: number;
  contactId: number;
  content: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'video';
  direction: 'incoming' | 'outgoing';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  encrypted: boolean;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id?: number;
  contactId: number;
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
  id?: number;
  username: string;
  displayName: string;
  avatar?: string;
  account: {
    address: string;
    publicKey: string;
    privateKey: string;
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

// Define the database class
export class EchoDatabase extends Dexie {
  // Define tables
  contacts!: Table<Contact>;
  messages!: Table<Message>;
  conversations!: Table<Conversation>;
  userProfile!: Table<UserProfile>;
  settings!: Table<Settings>;

  constructor() {
    super('EchoDatabase');

    // Define schema
    this.version(3).stores({
      contacts: '++id, username, displayName, isOnline, lastSeen, createdAt',
      messages:
        '++id, contactId, type, direction, status, timestamp, encrypted',
      conversations:
        '++id, contactId, lastMessageTimestamp, unreadCount, isPinned, isArchived',
      userProfile: '++id, username, status, lastSeen',
      settings: '++id, key, updatedAt',
    });

    // Add hooks for automatic timestamps
    this.contacts.hook('creating', function (_primKey, obj, _trans) {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });

    this.contacts.hook(
      'updating',
      function (modifications, _primKey, _obj, _trans) {
        (modifications as Record<string, unknown>).updatedAt = new Date();
      }
    );

    this.conversations.hook('creating', function (_primKey, obj, _trans) {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });

    this.conversations.hook(
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
  }

  // Helper methods for common operations
  async getContactByUsername(username: string): Promise<Contact | undefined> {
    return await this.contacts.where('username').equals(username).first();
  }

  async getMessagesForContact(
    contactId: number,
    limit = 50
  ): Promise<Message[]> {
    return await this.messages
      .where('contactId')
      .equals(contactId)
      .reverse()
      .limit(limit)
      .toArray();
  }

  async getConversations(): Promise<Conversation[]> {
    return await this.conversations
      .orderBy('lastMessageTimestamp')
      .reverse()
      .toArray();
  }

  async getUnreadCount(): Promise<number> {
    const conversations = await this.conversations.toArray();
    return conversations.reduce((total, conv) => total + conv.unreadCount, 0);
  }

  async markMessagesAsRead(contactId: number): Promise<void> {
    await this.messages
      .where(['contactId', 'status'])
      .equals([contactId, 'delivered'])
      .modify({ status: 'read' });

    await this.conversations
      .where('contactId')
      .equals(contactId)
      .modify({ unreadCount: 0 });
  }

  async addMessage(message: Omit<Message, 'id'>): Promise<number> {
    const messageId = await this.messages.add(message);

    // Update conversation
    const conversation = await this.conversations
      .where('contactId')
      .equals(message.contactId)
      .first();

    if (conversation) {
      await this.conversations.update(conversation.id!, {
        lastMessageId: messageId,
        lastMessageContent: message.content,
        lastMessageTimestamp: message.timestamp,
        unreadCount:
          message.direction === 'incoming'
            ? conversation.unreadCount + 1
            : conversation.unreadCount,
        updatedAt: new Date(),
      });
    } else {
      // Create new conversation
      await this.conversations.add({
        contactId: message.contactId,
        lastMessageId: messageId,
        lastMessageContent: message.content,
        lastMessageTimestamp: message.timestamp,
        unreadCount: message.direction === 'incoming' ? 1 : 0,
        isPinned: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
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
}

// Create and export the database instance
export const db = new EchoDatabase();
