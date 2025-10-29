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
import { notificationService } from './notifications';
import bs58check from 'bs58check';
import { processIncomingInitiation } from '../crypto/discussionInit';
import { getDecryptedWasmKeys } from '../stores/utils/wasmKeys';
import { generateUserKeys, getSessionModule } from '../wasm';

export interface MessageReceptionResult {
  success: boolean;
  newMessagesCount: number;
  error?: string;
}

export class MessageReceptionService {
  private _messageProtocol: IMessageProtocol | null = null;

  constructor(messageProtocol?: IMessageProtocol) {
    if (messageProtocol) {
      this._messageProtocol = messageProtocol;
    }
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

      // Get seekers and decrypt messages per seeker using WASM
      const messageProtocol = await this.getMessageProtocol();
      const sessionModule = await getSessionModule();
      const seekers = await sessionModule.getMessageBoardReadKeys();
      const { ourSk } = await getDecryptedWasmKeys();

      let storedCount = 0;
      // Fetch in one shot for all seekers
      const encryptedMessages = await messageProtocol.fetchMessages(seekers);
      for (const encryptedMsg of encryptedMessages) {
        const seeker = encryptedMsg.seeker;
        try {
          const out = await sessionModule.feedIncomingMessageBoardRead(
            seeker,
            encryptedMsg.ciphertext,
            ourSk
          );
          if (!out) continue;

          const decoder = new TextDecoder();
          const content = decoder.decode(out.message.contents);

          // Create a regular message entry for the UI
          await db.addMessage({
            contactUserId: discussion.contactUserId,
            content,
            type: 'text',
            direction: 'incoming',
            status: 'delivered',
            timestamp: encryptedMsg.timestamp,
            encrypted: true,
            metadata: encryptedMsg.metadata,
          });

          // Discussion metadata (last message, unread) is maintained by db.addMessage

          // Update discussion with new seeker from acknowledged_seekers
          if (out.acknowledged_seekers && out.acknowledged_seekers.length > 0) {
            const newSeeker = out.acknowledged_seekers[0]; // Take the first acknowledged seeker
            await db.discussions.update(discussionId, {
              nextSeeker: newSeeker,
              updatedAt: new Date(),
            });
          }

          storedCount++;
        } catch (error) {
          console.error('Failed to decrypt/process message:', error);
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
      console.log(discussion);
      const contactUserId = discussion.contactUserId;

      const contactIdentity = await generateUserKeys(contactUserId);
      const sessionModule = await getSessionModule();

      // if there is no message yet, respond to the anouncement
      const messages = await db.messages
        .where('contactUserId')
        .equals(contactUserId)
        .filter(m => m.direction === 'incoming')
        .toArray();
      if (messages.length === 0) {
        if (!discussion.initiationAnnouncement) {
          throw new Error('No initiation announcement found');
        }
        await sessionModule.feedIncomingAnnouncement(
          discussion.initiationAnnouncement,
          contactIdentity.public_keys(),
          contactIdentity.secret_keys()
        );
      }

      // Create a mock encrypted message with seeker
      const mockSeeker = crypto.getRandomValues(new Uint8Array(32));
      const mockMessage = {
        id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        seeker: mockSeeker,
        ciphertext: crypto.getRandomValues(new Uint8Array(128)),
        ct: crypto.getRandomValues(new Uint8Array(32)),
        rand: crypto.getRandomValues(new Uint8Array(32)),
        nonce: crypto.getRandomValues(new Uint8Array(12)),
        messageType: 'regular' as const,
        direction: 'incoming' as const,
        timestamp: new Date(),
        metadata: { simulated: true },
      };

      // Add to mock protocol's message store so it can be fetched and decrypted
      const messageProtocol = await this.getMessageProtocol();
      if ('addMockMessage' in messageProtocol) {
        const seekerHex = Array.from(mockSeeker)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        type MockProtocol = {
          addMockMessage?: (
            seekerHex: string,
            message: typeof mockMessage
          ) => void;
        };
        (messageProtocol as MockProtocol).addMockMessage?.(
          seekerHex,
          mockMessage
        );
      }

      // For simulation, directly process the message since getMessageBoardReadKeys()
      // returns empty when no outgoing sessions are established
      const { ourSk } = await getDecryptedWasmKeys();

      try {
        console.log(
          'Attempting to decrypt simulated message with seeker:',
          Array.from(mockSeeker).slice(0, 8)
        );
        const out = await sessionModule.feedIncomingMessageBoardRead(
          mockSeeker,
          mockMessage.ciphertext,
          ourSk
        );

        if (out) {
          console.log('WASM decryption successful, creating message');
          const decoder = new TextDecoder();
          const content = decoder.decode(out.message.contents);

          // Create a regular message entry for the UI
          const messageId = await db.addMessage({
            contactUserId: discussion.contactUserId,
            content,
            type: 'text',
            direction: 'incoming',
            status: 'delivered',
            timestamp: mockMessage.timestamp,
            encrypted: true,
            metadata: mockMessage.metadata,
          });
          console.log(
            'Created message with ID:',
            messageId,
            'for contact:',
            discussion.contactUserId
          );

          // Discussion metadata (last message, unread) is maintained by db.addMessage

          // Update discussion with new seeker from acknowledged_seekers
          if (out.acknowledged_seekers && out.acknowledged_seekers.length > 0) {
            const newSeeker = out.acknowledged_seekers[0];
            await db.discussions.update(discussionId, {
              nextSeeker: newSeeker,
              updatedAt: new Date(),
            });
          }
        } else {
          console.log('WASM decryption returned null, using fallback');
          throw new Error('WASM decryption returned null');
        }
      } catch (error) {
        console.error('Failed to decrypt simulated message:', error);
        console.log(
          'Using fallback: creating simple message without decryption'
        );
        // Fallback: create a simple message without decryption
        const messageId = await db.addMessage({
          contactUserId: discussion.contactUserId,
          content: 'This is a simulated received message for testing purposes.',
          type: 'text',
          direction: 'incoming',
          status: 'delivered',
          timestamp: mockMessage.timestamp,
          encrypted: false,
          metadata: mockMessage.metadata,
        });
        console.log(
          'Created fallback message with ID:',
          messageId,
          'for contact:',
          discussion.contactUserId
        );

        // Discussion metadata (last message, unread) is maintained by db.addMessage
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
      // Extract contact information from the announcement
      const contactUserId =
        this._extractContactUserIdFromAnnouncement(announcementData);
      if (!contactUserId) {
        throw new Error('Could not extract contact user ID from announcement');
      }

      // Create contact if it doesn't exist (for simulation/testing)
      let contact = await db.contacts
        .where('userId')
        .equals(contactUserId)
        .first();
      if (!contact) {
        // Create a mock contact for simulation
        await db.contacts.add({
          userId: contactUserId,
          name: `User ${contactUserId.substring(0, 8)}`,
          avatar: undefined,
          isOnline: false,
          lastSeen: new Date(),
          createdAt: new Date(),
        });
        contact = await db.contacts
          .where('userId')
          .equals(contactUserId)
          .first();
      }

      // Delegate to the new WASM-based initiation processor
      const { discussionId } = await processIncomingInitiation(
        contactUserId,
        announcementData
      );

      // Show notification for new discussion
      try {
        await notificationService.showNewDiscussionNotification(
          contact?.name || `User ${contactUserId.substring(0, 8)}`
        );
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
