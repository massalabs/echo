/**
 * Message Reception Service
 *
 * Handles fetching encrypted messages from the protocol and decrypting them.
 * This service works both in the main app context and Service Worker context.
 */

import { db, Message } from '../db';
import { decodeUserId } from '../utils/userId';
import {
  IMessageProtocol,
  createMessageProtocol,
} from '../api/messageProtocol';
import { useAccountStore } from '../stores/accountStore';
import { announcementService } from './announcement';
import { strToBytes } from '@massalabs/massa-web3';
import { SessionStatus } from '../assets/generated/wasm/echo_wasm';

export interface MessageResult {
  success: boolean;
  newMessagesCount: number;
  error?: string;
}

export interface SendMessageResult {
  success: boolean;
  message?: Message;
  error?: string;
}

export class MessageService {
  private _messageProtocol: IMessageProtocol | null = null;

  constructor(messageProtocol?: IMessageProtocol) {
    if (messageProtocol) {
      this._messageProtocol = messageProtocol;
    }
  }

  getMessageProtocol(): IMessageProtocol {
    if (!this._messageProtocol) {
      this._messageProtocol = createMessageProtocol();
    }
    return this._messageProtocol;
  }

  /**
   * Fetch new encrypted messages for a specific discussion
   * @param discussionId - The discussion ID
   * @returns Result with count of new messages fetched
   */
  async fetchNewMessages(discussionId: number): Promise<MessageResult> {
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
      const messageProtocol = this.getMessageProtocol();
      const { session, ourSk } = useAccountStore.getState();
      if (!session) throw new Error('Session module not initialized');
      if (!ourSk) throw new Error('WASM secret keys unavailable');

      const seekers = session.getMessageBoardReadKeys(); // TODO: I don't think it's the most efficient way

      // Nothing to fetch when there are no seeker keys
      if (!seekers || seekers.length === 0) {
        return {
          success: true,
          newMessagesCount: 0,
        };
      }

      let storedCount = 0;
      // Fetch in one shot for all seekers
      const encryptedMessages = await messageProtocol.fetchMessages(seekers);

      for (const encryptedMsg of encryptedMessages) {
        const seeker = encryptedMsg.seeker;
        try {
          const out = session.feedIncomingMessageBoardRead(
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
            timestamp: out.timestamp ? new Date(out.timestamp) : new Date(), // TODO: add timestamp from server or use out.timestamp
            encrypted: true,
            metadata: {},
          });

          if (out.acknowledged_seekers && out.acknowledged_seekers.length > 0) {
            const newSeeker = out.acknowledged_seekers[0]; // Take the first acknowledged seeker
            await db.discussions.update(discussionId, {
              nextSeeker: newSeeker, // TODO: we can remove this and rely on session manger
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
  async fetchAllDiscussions(): Promise<MessageResult> {
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

  /**
   * Create a text message, persist it as sending, send via protocol, and update status.
   * Returns the created message (with final status) on success/failure.
   */
  async sendMessage(
    contactUserId: string,
    content: string
  ): Promise<SendMessageResult> {
    try {
      const ownerUserId = useAccountStore.getState().userProfile?.userId;
      if (!ownerUserId)
        return { success: false, error: 'No authenticated user' };
      if (!content) return { success: false, error: 'Empty content' };

      const discussion = await db.getDiscussionByOwnerAndContact(
        ownerUserId,
        contactUserId
      );

      if (!discussion) return { success: false, error: 'Discussion not found' };

      // Create message with sending status
      const messageBase: Omit<Message, 'id'> = {
        ownerUserId,
        contactUserId,
        content,
        type: 'text',
        direction: 'outgoing',
        status: 'sending',
        timestamp: new Date(),
        encrypted: true,
      };

      const messageId = await db.addMessage(messageBase);

      // Try sending via protocol
      try {
        const session = useAccountStore.getState().session;
        if (!session) throw new Error('Session module not initialized');
        const peerId = decodeUserId(contactUserId);
        const contentBytes = strToBytes(content);

        // Validate peer ID length
        if (peerId.length !== 32) {
          return {
            success: false,
            error: 'Invalid contact userId (must decode to 32 bytes)',
          };
        }

        // Ensure session is active before sending
        const status = session.peerSessionStatus(peerId);
        if (status !== SessionStatus.Active) {
          const statusName =
            SessionStatus[status as unknown as number] ?? String(status);
          return { success: false, error: `Session not ready: ${statusName}` };
        }

        const sendOutput = session.sendMessage(peerId, contentBytes);

        if (!sendOutput) throw new Error('WASM sendMessage returned null');

        const messageProtocol = this.getMessageProtocol();

        await messageProtocol.sendMessage(sendOutput.seeker, {
          seeker: sendOutput.seeker,
          ciphertext: sendOutput.data,
        });

        await db.messages.update(messageId, { status: 'sent' });

        return {
          success: true,
          message: { ...messageBase, id: messageId, status: 'sent' },
        };
      } catch (error) {
        await db.messages.update(messageId, { status: 'failed' });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Send failed',
          message: { ...messageBase, id: messageId, status: 'failed' },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const messageService = new MessageService();
