/**
 * Message Reception Service
 *
 * Handles fetching encrypted messages from the protocol and decrypting them.
 * This service works both in the main app context and Service Worker context.
 */

import { db } from '../db';
import {
  EncryptedMessage,
  IMessageProtocol,
  createMessageProtocol,
} from '../api/messageProtocol';
import bs58check from 'bs58check';
import { useAccountStore } from '../stores/accountStore';
import { generateUserKeys, getSessionModule, SessionModule } from '../wasm';
import { announcementService } from './announcement';

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
      this._messageProtocol = await createMessageProtocol();
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
      const { ourSk } = useAccountStore.getState();
      if (!ourSk) throw new Error('WASM secret keys unavailable');

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
          const content = decoder.decode(out.message);

          // Create a regular message entry for the UI
          const ownerUserId = useAccountStore.getState().userProfile?.userId;
          if (!ownerUserId) throw new Error('No authenticated user');
          await db.addMessage({
            ownerUserId,
            contactUserId: discussion.contactUserId,
            content,
            type: 'text',
            direction: 'incoming',
            status: 'delivered',
            timestamp: encryptedMsg.timestamp,
            encrypted: true,
            metadata: {},
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
      const ownerUserId = useAccountStore.getState().userProfile?.userId;
      if (!ownerUserId) throw new Error('No authenticated user');
      const activeDiscussions =
        await db.getActiveDiscussionsByOwner(ownerUserId);
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

      // Also check for incoming session announcements
      const announcementSvc = await announcementService.getInstance();
      const announcementResult =
        await announcementSvc.fetchAndProcessAnnouncements();
      if (announcementResult.success) {
        totalNewMessages += announcementResult.newDiscussionsCount;
      } else if (announcementResult.error) {
        hasErrors = true;
        console.error(
          'Failed to check for incoming session announcements:',
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

  // =========================
  // Simulation helpers (test/dev)
  // =========================

  // simulateIncomingDiscussion moved to AnnouncementService

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

      const { ourPk } = useAccountStore.getState();
      if (!ourPk) throw new Error('WASM public keys unavailable');
      const ourUserId = ourPk.derive_id();

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

      // Retrieve the contact to get its identifier
      const ownerUserId2 = useAccountStore.getState().userProfile?.userId;
      if (!ownerUserId2) throw new Error('No authenticated user');
      const contact = await db.getContactByOwnerAndUserId(
        ownerUserId2,
        contactUserId
      );
      if (!contact) {
        return {
          success: false,
          newMessagesCount: 0,
          error: 'Contact not found',
        };
      }

      const contactIdentity = await generateUserKeys(
        `test_user_${contact.name}`
      );
      // Get the peer ID from the contact's public keys
      const contactPublicKeys = contactIdentity.public_keys();
      const contactSecretKeys = contactIdentity.secret_keys();
      // create a local session module instance
      const sessionModule = new SessionModule();
      await sessionModule.init();

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
          contactPublicKeys,
          contactSecretKeys
        );
        await sessionModule.establishOutgoingSession(
          ourPk,
          contactPublicKeys,
          contactSecretKeys
        );
      }

      const peerList = await sessionModule.peerList();
      console.log(
        'peers',
        peerList.map(p => bs58check.encode(p))
      );
      console.log(
        'peer status',
        await sessionModule.peerSessionStatus(ourUserId)
      );

      // Create a new Message with test content using sendMessage
      const testContent =
        'This is a simulated received message for testing purposes.';
      const messageContent = new TextEncoder().encode(testContent);

      // Use sendMessage to create a properly encrypted message
      const sendOutput = await sessionModule.sendMessage(
        ourUserId,
        messageContent
      );
      if (!sendOutput) {
        throw new Error('sendMessage returned null');
      }

      // Now we have a properly encrypted message with seeker and ciphertext
      const { seeker, data: ciphertext } = sendOutput;

      // Create message object matching simplified EncryptedMessage interface
      const mockMessage: EncryptedMessage = {
        seeker,
        ciphertext,
        timestamp: new Date(),
      };

      // Add to mock protocol's message store so it can be fetched and decrypted
      const messageProtocol = await this.getMessageProtocol();
      await messageProtocol.sendMessage(seeker, mockMessage);

      console.log('msg sent', seeker);

      // try {
      // console.log(
      //   'Attempting to decrypt simulated message with seeker:',
      //   Array.from(seeker).slice(0, 8)
      // );
      // const out = await sessionModule.feedIncomingMessageBoardRead(
      //   seeker,
      //   ciphertext,
      //   ourSk
      // );

      // if (out) {
      //   console.log('WASM decryption successful, creating message');
      //   const decoder = new TextDecoder();
      //   const content = decoder.decode(out.message.contents);

      //   // Create a regular message entry for the UI
      //   const messageId = await db.addMessage({
      //     contactUserId: discussion.contactUserId,
      //     content,
      //     type: 'text',
      //     direction: 'incoming',
      //     status: 'delivered',
      //     timestamp: mockMessage.timestamp,
      //     encrypted: true,
      //     metadata: { simulated: true },
      //   });
      //   console.log(
      //     'Created message with ID:',
      //     messageId,
      //     'for contact:',
      //     discussion.contactUserId
      //   );

      //   // Discussion metadata (last message, unread) is maintained by db.addMessage

      //   // Update discussion with new seeker from acknowledged_seekers
      //   if (
      //     out.acknowledged_seekers &&
      //     out.acknowledged_seekers.length > 0
      //   ) {
      //     const newSeeker = out.acknowledged_seekers[0];
      //     await db.discussions.update(discussionId, {
      //       nextSeeker: newSeeker,
      //       updatedAt: new Date(),
      //     });
      //   }
      // } else {
      //   console.log('WASM decryption returned null, using fallback');
      //   throw new Error('WASM decryption returned null');
      // }
      // } catch (error) {
      //   console.error('Failed to decrypt simulated message:', error);
      //   console.log(
      //     'Using fallback: creating simple message without decryption'
      //   );
      //   // Fallback: create a simple message without decryption
      //   const messageId = await db.addMessage({
      //     contactUserId: discussion.contactUserId,
      //     content: 'This is a simulated received message for testing purposes.',
      //     type: 'text',
      //     direction: 'incoming',
      //     status: 'delivered',
      //     timestamp: new Date(),
      //     encrypted: false,
      //     metadata: { simulated: true },
      //   });
      //   console.log(
      //     'Created fallback message with ID:',
      //     messageId,
      //     'for contact:',
      //     discussion.contactUserId
      //   );
      // }

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

  // =========================
  // Private helpers
  // =========================

  // Announcement processing moved to AnnouncementService

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
