/**
 * Message Reception Service
 *
 * Handles fetching encrypted messages from the protocol and decrypting them.
 * This service works both in the main app context and Service Worker context.
 */

import { db } from '../db';
import {
  IMessageProtocol,
  createMessageProtocol,
} from '../api/messageProtocol';
import { wasmLoader, SessionModule } from '../wasm';
import { notificationService } from './notifications';
import bs58check from 'bs58check';

export interface MessageReceptionResult {
  success: boolean;
  newMessagesCount: number;
  error?: string;
}

export class MessageReceptionService {
  private _messageProtocol: IMessageProtocol | null = null;
  private sessionModule: SessionModule | null = null;

  constructor(messageProtocol?: IMessageProtocol) {
    if (messageProtocol) {
      this._messageProtocol = messageProtocol;
    }
  }

  async getSessionModule(): Promise<SessionModule> {
    if (!this.sessionModule) {
      // Ensure WASM modules are loaded
      await wasmLoader.loadModules();
      this.sessionModule = wasmLoader.getModule<SessionModule>('session');
    }
    return this.sessionModule;
  }

  async getMessageProtocol(): Promise<IMessageProtocol> {
    if (!this._messageProtocol) {
      this._messageProtocol = await createMessageProtocol('mock');
    }
    return this._messageProtocol;
  }

  /**
   * Fetch new encrypted messages for a specific discussion
   * @param discussionId - The discussion ID
   * @returns Result with count of new messages fetched
   */
  async fetchNewMessages(
    discussionId: number
  ): Promise<MessageReceptionResult> {
    try {
      // Get the discussion from database
      const discussion = await db.discussions.get(discussionId);
      if (!discussion) {
        return {
          success: false,
          newMessagesCount: 0,
          error: 'Discussion not found',
        };
      }

      // Get the session to access the discussion key
      const sessionModule = await this.getSessionModule();
      const session = await sessionModule.getSession(discussion.id!.toString());
      if (!session) {
        return {
          success: false,
          newMessagesCount: 0,
          error: 'Session not found',
        };
      }

      // Fetch encrypted messages from protocol
      const messageProtocol = await this.getMessageProtocol();
      const encryptedMessages = await messageProtocol.fetchMessages(
        session.discussionKey
      );

      // Filter out messages we already have
      const existingMessages = await db.discussionMessages
        .where('discussionId')
        .equals(discussionId)
        .toArray();

      const existingMessageIds = new Set(existingMessages.map(msg => msg.id));
      const newMessages = encryptedMessages.filter(
        msg => !existingMessageIds.has(Number(msg.id))
      );

      // Store new encrypted messages in database
      let storedCount = 0;
      for (const encryptedMsg of newMessages) {
        try {
          await db.discussionMessages.add({
            discussionId,
            messageType: encryptedMsg.messageType,
            direction: encryptedMsg.direction,
            ciphertext: encryptedMsg.ciphertext,
            ct: encryptedMsg.ct,
            rand: encryptedMsg.rand,
            nonce: encryptedMsg.nonce,
            status: 'delivered',
            timestamp: encryptedMsg.timestamp,
            metadata: encryptedMsg.metadata,
          });
          storedCount++;
        } catch (error) {
          console.error('Failed to store encrypted message:', error);
        }
      }

      // Update last sync timestamp
      if (storedCount > 0) {
        await db.updateLastSyncTimestamp(discussionId, new Date());
      }

      return {
        success: true,
        newMessagesCount: storedCount,
      };
    } catch (error) {
      console.error('Failed to fetch new messages:', error);
      return {
        success: false,
        newMessagesCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch messages for all active discussions
   * @returns Result with total count of new messages fetched
   */
  async fetchAllDiscussions(): Promise<MessageReceptionResult> {
    try {
      const activeDiscussions = await db.getActiveDiscussions();
      let totalNewMessages = 0;
      let hasErrors = false;

      for (const discussion of activeDiscussions) {
        if (!discussion.id) continue;

        const result = await this.fetchNewMessages(discussion.id);
        if (result.success) {
          totalNewMessages += result.newMessagesCount;
        } else {
          hasErrors = true;
          console.error(
            `Failed to fetch messages for discussion ${discussion.id}:`,
            result.error
          );
        }
      }

      // Also check for incoming discussion announcements
      const announcementResult = await this.checkForIncomingDiscussions();
      if (announcementResult.success) {
        totalNewMessages += announcementResult.newMessagesCount;
      } else if (announcementResult.error) {
        hasErrors = true;
        console.error(
          'Failed to check for incoming discussions:',
          announcementResult.error
        );
      }

      return {
        success: !hasErrors || totalNewMessages > 0,
        newMessagesCount: totalNewMessages,
        error: hasErrors ? 'Some discussions failed to sync' : undefined,
      };
    } catch (error) {
      console.error('Failed to fetch messages for all discussions:', error);
      return {
        success: false,
        newMessagesCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check for incoming discussion announcements
   * @returns Result with count of new discussions created
   */
  async checkForIncomingDiscussions(): Promise<MessageReceptionResult> {
    try {
      console.log('Checking for incoming discussion announcements...');

      // This would typically involve checking a global announcement channel
      // For now, we'll simulate this by checking if there are any pending announcements
      // In a real implementation, this would query a specific announcement endpoint
      const announcements = await this._fetchIncomingAnnouncements();

      let newDiscussionsCount = 0;

      for (const announcement of announcements) {
        try {
          const result = await this._processIncomingAnnouncement(announcement);
          if (result.success) {
            newDiscussionsCount++;
            console.log(
              'Created new discussion from announcement:',
              result.discussionId
            );
          }
        } catch (error) {
          console.error('Failed to process incoming announcement:', error);
        }
      }

      return {
        success: true,
        newMessagesCount: newDiscussionsCount,
      };
    } catch (error) {
      console.error('Failed to check for incoming discussions:', error);
      return {
        success: false,
        newMessagesCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Simulate an incoming discussion announcement for testing
   * @returns Result with count of new discussions created
   */
  async simulateIncomingDiscussion(): Promise<MessageReceptionResult> {
    try {
      console.log('Simulating incoming discussion announcement...');

      // Create a mock announcement with more realistic data
      const mockAnnouncement = new Uint8Array(64);
      crypto.getRandomValues(mockAnnouncement);

      // Process the mock announcement
      const result = await this._processIncomingAnnouncement(mockAnnouncement);

      if (result.success) {
        console.log(
          'Successfully simulated incoming discussion:',
          result.discussionId
        );
        return {
          success: true,
          newMessagesCount: 1,
        };
      } else {
        console.error('Failed to simulate incoming discussion:', result.error);
        return {
          success: false,
          newMessagesCount: 0,
          error: result.error,
        };
      }
    } catch (error) {
      console.error('Failed to simulate incoming discussion:', error);
      return {
        success: false,
        newMessagesCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Simulate receiving a message for an existing discussion
   * @param discussionId - The discussion ID to simulate a message for
   * @returns Result with count of new messages created
   */
  async simulateReceivedMessage(
    discussionId: number
  ): Promise<MessageReceptionResult> {
    try {
      console.log('Simulating received message for discussion:', discussionId);

      // Get the discussion to access the session
      const discussion = await db.discussions.get(discussionId);
      if (!discussion) {
        return {
          success: false,
          newMessagesCount: 0,
          error: 'Discussion not found',
        };
      }

      const sessionModule = await this.getSessionModule();
      let session = await sessionModule.getSession(discussionId.toString());

      // If session doesn't exist, create one (for backward compatibility)
      if (!session) {
        console.log(
          'Session not found, creating one for discussion:',
          discussionId
        );
        await sessionModule.createSession(discussionId.toString());
        session = await sessionModule.getSession(discussionId.toString());

        if (!session) {
          return {
            success: false,
            newMessagesCount: 0,
            error: 'Failed to create session',
          };
        }
      }

      // Create a mock encrypted message
      const mockMessage = {
        id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        ciphertext: crypto.getRandomValues(new Uint8Array(128)),
        ct: crypto.getRandomValues(new Uint8Array(32)),
        rand: crypto.getRandomValues(new Uint8Array(32)),
        nonce: crypto.getRandomValues(new Uint8Array(12)),
        messageType: 'regular' as const,
        direction: 'incoming' as const,
        timestamp: new Date(),
        metadata: { simulated: true },
      };

      // Store the mock encrypted message
      await db.discussionMessages.add({
        discussionId,
        messageType: 'regular',
        direction: 'incoming',
        ciphertext: mockMessage.ciphertext,
        ct: mockMessage.ct,
        rand: mockMessage.rand,
        nonce: mockMessage.nonce,
        status: 'delivered',
        timestamp: mockMessage.timestamp,
        metadata: mockMessage.metadata,
      });

      // Create a regular message for the UI
      const contact = await db.contacts
        .where('userId')
        .equals(discussion.contactUserId)
        .first();
      if (contact) {
        await db.addMessage({
          contactUserId: contact.userId,
          content: 'This is a simulated received message for testing purposes.',
          type: 'text',
          direction: 'incoming',
          status: 'delivered',
          timestamp: new Date(),
          encrypted: true,
        });
      }

      console.log(
        'Successfully simulated received message for discussion:',
        discussionId
      );
      return {
        success: true,
        newMessagesCount: 1,
      };
    } catch (error) {
      console.error('Failed to simulate received message:', error);
      return {
        success: false,
        newMessagesCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch incoming discussion announcements from the protocol
   * @returns Array of announcement data
   */
  private async _fetchIncomingAnnouncements(): Promise<Uint8Array[]> {
    try {
      const messageProtocol = await this.getMessageProtocol();
      const announcements = await messageProtocol.fetchAnnouncements();
      return announcements;
    } catch (error) {
      console.error('Failed to fetch incoming announcements:', error);
      // Return empty array to let caller handle the failure appropriately
      return [];
    }
  }

  /**
   * Process an incoming discussion announcement
   * @param announcementData - The announcement data
   * @returns Result with discussion ID if successful
   */
  private async _processIncomingAnnouncement(
    announcementData: Uint8Array
  ): Promise<{
    success: boolean;
    discussionId?: number;
    contactUserId?: string;
    error?: string;
  }> {
    try {
      const sessionModule = await this.getSessionModule();

      // Process the incoming announcement using the session module
      const result =
        await sessionModule.feedIncomingAnnouncement(announcementData);

      // Extract contact information from the announcement
      // In a real implementation, this would parse the announcement data
      const contactUserId =
        this._extractContactUserIdFromAnnouncement(announcementData);
      if (!contactUserId) {
        throw new Error('Could not extract contact user ID from announcement');
      }

      // Check if contact already exists
      let contact = await db.contacts
        .where('userId')
        .equals(contactUserId)
        .first();

      if (!contact) {
        // Create new contact
        contact = {
          userId: contactUserId,
          name: `User ${contactUserId.substring(0, 8)}`, // Default name
          isOnline: false,
          lastSeen: new Date(),
          createdAt: new Date(),
        };
        await db.contacts.add(contact);
        console.log(
          'Created new contact for incoming discussion:',
          contactUserId
        );
      }

      // Create discussion record
      const discussionId = await db.discussions.add({
        contactUserId,
        direction: 'received',
        status: 'active',
        masterKey: result.session.masterKey,
        innerKey: result.session.innerKey,
        nextPublicKey: result.session.nextPublicKey,
        nextPrivateKey: new Uint8Array(0), // Recipient doesn't have the private key
        version: result.session.version,
        discussionKey: result.session.discussionKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create session in session module with discussion ID as key
      await sessionModule.createSession(discussionId.toString());

      // Create discussion thread for UI
      await db.discussionThreads.add({
        contactUserId,
        lastMessageId: undefined,
        lastMessageContent: 'New discussion started',
        lastMessageTimestamp: new Date(),
        unreadCount: 1, // New discussion has 1 unread
        isPinned: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Store the initiation message
      await db.discussionMessages.add({
        discussionId,
        messageType: 'initiation',
        direction: 'incoming',
        ciphertext: result.postData.ciphertext,
        ct: result.postData.ct,
        rand: result.postData.rand,
        nonce: new Uint8Array(12), // Mock nonce
        status: 'delivered',
        timestamp: new Date(),
      });

      // Show notification for new discussion
      try {
        await notificationService.showNewDiscussionNotification(contact.name);
      } catch (notificationError) {
        console.error(
          'Failed to show new discussion notification:',
          notificationError
        );
      }

      return {
        success: true,
        discussionId,
        contactUserId,
      };
    } catch (error) {
      console.error('Failed to process incoming announcement:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extract contact user ID from announcement data
   * @param announcementData - The announcement data
   * @returns Contact user ID or null if not found
   */
  private _extractContactUserIdFromAnnouncement(
    announcementData: Uint8Array
  ): string | null {
    try {
      // In a real implementation, this would parse the announcement data
      // to extract the sender's user ID. For now, we'll generate a mock ID.
      const mockUserIdBytes = new Uint8Array(announcementData.slice(0, 32));
      const mockUserId = bs58check.encode(mockUserIdBytes);
      return mockUserId;
    } catch (error) {
      console.error(
        'Failed to extract contact user ID from announcement:',
        error
      );
      return null;
    }
  }

  /**
   * Decrypt stored encrypted messages for a discussion
   * This should only be called from the main app context, not Service Worker
   * @param discussionId - The discussion ID
   * @returns Result with count of messages decrypted
   */
  async decryptMessages(discussionId: number): Promise<MessageReceptionResult> {
    try {
      // Get encrypted messages that haven't been decrypted yet
      const encryptedMessages = await db.discussionMessages
        .where('discussionId')
        .equals(discussionId)
        .filter(msg => msg.direction === 'incoming')
        .toArray();

      // Get the discussion to find the contact
      const discussion = await db.discussions.get(discussionId);
      if (!discussion) {
        return {
          success: false,
          newMessagesCount: 0,
          error: 'Discussion not found',
        };
      }

      let decryptedCount = 0;

      for (const encryptedMsg of encryptedMessages) {
        try {
          // Decrypt the message using the session module
          const sessionModule = await this.getSessionModule();
          const decryptedContent = await sessionModule.decryptMessage(
            discussionId.toString(),
            encryptedMsg.ciphertext
          );

          // Create a regular message entry
          const messageId = await db.addMessage({
            contactUserId: discussion.contactUserId,
            content: decryptedContent,
            type: 'text',
            direction: 'incoming',
            status: 'delivered',
            timestamp: encryptedMsg.timestamp,
            encrypted: true,
            metadata: encryptedMsg.metadata,
          });

          // Update the discussion thread
          await db.discussionThreads
            .where('contactUserId')
            .equals(discussion.contactUserId)
            .modify(thread => {
              thread.lastMessageId = messageId;
              thread.lastMessageContent = decryptedContent;
              thread.lastMessageTimestamp = encryptedMsg.timestamp;
              // Increment unread count for each decrypted message
              thread.unreadCount = thread.unreadCount + 1;
              thread.updatedAt = new Date();
            });

          decryptedCount++;
        } catch (error) {
          console.error('Failed to decrypt message:', error);
        }
      }

      return {
        success: true,
        newMessagesCount: decryptedCount,
      };
    } catch (error) {
      console.error('Failed to decrypt messages:', error);
      return {
        success: false,
        newMessagesCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if there are new encrypted messages for a discussion
   * @param discussionId - The discussion ID
   * @returns True if there are new encrypted messages
   */
  async hasNewEncryptedMessages(discussionId: number): Promise<boolean> {
    try {
      const encryptedMessages = await db.discussionMessages
        .where('discussionId')
        .equals(discussionId)
        .filter(msg => msg.direction === 'incoming')
        .count();

      return encryptedMessages > 0;
    } catch (error) {
      console.error('Failed to check for new encrypted messages:', error);
      return false;
    }
  }

  /**
   * Get count of new encrypted messages across all discussions
   * @returns Total count of new encrypted messages
   */
  async getTotalNewEncryptedMessages(): Promise<number> {
    try {
      const activeDiscussions = await db.getActiveDiscussions();
      let totalCount = 0;

      for (const discussion of activeDiscussions) {
        if (!discussion.id) continue;

        const count = await db.discussionMessages
          .where('discussionId')
          .equals(discussion.id)
          .filter(msg => msg.direction === 'incoming')
          .count();

        totalCount += count;
      }

      return totalCount;
    } catch (error) {
      console.error('Failed to get total new encrypted messages:', error);
      return 0;
    }
  }
}

// Export singleton instance - will be created lazily when first accessed
let _messageReceptionService: MessageReceptionService | null = null;

export const messageReceptionService = {
  async getInstance(): Promise<MessageReceptionService> {
    if (!_messageReceptionService) {
      _messageReceptionService = new MessageReceptionService();
      // Initialize the message protocol (now synchronous with mock)
      await _messageReceptionService.getMessageProtocol();
    }
    return _messageReceptionService;
  },
};
