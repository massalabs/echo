/**
 * Message Reception Service
 *
 * Handles fetching encrypted messages from the protocol and decrypting them.
 * This service works both in the main app context and Service Worker context.
 */

import { db, Message, Discussion } from '../db';
import { decodeUserId, encodeUserId } from '../utils/userId';
import {
  IMessageProtocol,
  createMessageProtocol,
  EncryptedMessage,
} from '../api/messageProtocol';
import { useAccountStore } from '../stores/accountStore';
import { strToBytes } from '@massalabs/massa-web3';
import { SessionStatus } from '../assets/generated/wasm/gossip_wasm';

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
  constructor(public readonly messageProtocol: IMessageProtocol) {}

  /**
   * Fetch new encrypted messages for a specific discussion
   * @param discussionId - The discussion ID
   * @returns Result with count of new messages fetched
   */
  async fetchMessages(): Promise<MessageResult> {
    try {
      // -------------------------------------------------
      // 0. Guards
      // -------------------------------------------------
      const { session, ourSk, userProfile } = useAccountStore.getState();
      if (!session) throw new Error('Session module not initialized');
      if (!ourSk) throw new Error('WASM secret keys unavailable');
      if (!userProfile?.userId) throw new Error('No authenticated user');

      const ownerUserId = userProfile.userId;

      // Get all seekers for all active sessions
      const seekers = session.getMessageBoardReadKeys();
      if (!seekers?.length) {
        return { success: true, newMessagesCount: 0 };
      }

      // First, check if service worker has already fetched messages
      let encrypted: EncryptedMessage[];
      const pendingMessages = await db.pendingEncryptedMessages.toArray();

      const pendingMessagesForUser = pendingMessages.filter(p => seekers.includes(p.seeker));
      if (pendingMessagesForUser.length > 0) {
        // Use messages from IndexedDB
        encrypted = pendingMessagesForUser.map(p => ({
          seeker: p.seeker,
          ciphertext: p.ciphertext,
        }));
        // Delete only the messages we just read (by their IDs) to avoid race condition
        // If service worker adds new messages between read and delete, they won't be lost
        const messageIds = pendingMessagesForUser
          .map(p => p.id)
          .filter((id): id is number => id !== undefined);
        if (messageIds.length > 0) {
          await db.pendingEncryptedMessages.bulkDelete(messageIds);
        }
      } else {
        // If no pending messages, fetch from API
        encrypted = await this.messageProtocol.fetchMessages(seekers);
      }

      if (!encrypted.length) {
        return { success: true, newMessagesCount: 0 };
      }

      // -------------------------------------------------
      // 1. Decrypt everything (CPU only)
      // -------------------------------------------------
      interface Decrypted {
        content: string;
        sentAt: Date;
        senderId: string;
      }
      const decrypted: Decrypted[] = [];

      for (const msg of encrypted) {
        try {
          const out = session.feedIncomingMessageBoardRead(
            msg.seeker,
            msg.ciphertext,
            ourSk
          );
          if (!out) continue;

          decrypted.push({
            content: new TextDecoder().decode(out.message),
            sentAt: new Date(Number(out.timestamp)),
            senderId: encodeUserId(out.user_id),
          });
        } catch (e) {
          console.error('Decrypt failed:', e);
        }
      }

      if (!decrypted.length) {
        return { success: true, newMessagesCount: 0 };
      }

      // -------------------------------------------------
      // 2. One transaction → parallel DB work
      // -------------------------------------------------
      let stored = 0;

      await db.transaction('rw', db.messages, db.discussions, async () => {
        // ---- 2a. Pre-load all discussions (parallel) ----
        // Use allSettled to handle missing discussions gracefully
        const discPromises = decrypted.map(async ({ senderId }) => {
          const d = await db.getDiscussionByOwnerAndContact(
            ownerUserId,
            senderId
          );
          if (!d) {
            return { senderId, discussion: null };
          }
          return { senderId, discussion: d };
        });
        const discResults = await Promise.allSettled(discPromises);
        const discMap = new Map<string, Discussion>();

        // Filter out senders without discussions
        for (const result of discResults) {
          if (result.status === 'fulfilled' && result.value.discussion) {
            discMap.set(result.value.senderId, result.value.discussion);
          }
        }

        // Filter decrypted messages to only process those with discussions
        const messagesWithDiscussions = decrypted.filter(({ senderId }) =>
          discMap.has(senderId)
        );

        if (!messagesWithDiscussions.length) {
          // No messages have valid discussions, skip this batch
          return;
        }

        // ---- 2b. Insert messages (parallel) ----
        // Only insert messages for senders that have discussions
        const msgPromises = messagesWithDiscussions.map(
          async ({ content, sentAt, senderId }) => {
            const id = await db.messages.add({
              ownerUserId,
              contactUserId: senderId,
              content,
              type: 'text' as const,
              direction: 'incoming' as const,
              status: 'delivered' as const,
              timestamp: sentAt,
              metadata: {},
            });
            return { id, senderId, content, sentAt };
          }
        );
        const inserted = await Promise.all(msgPromises);

        // ---- 2c. Update discussions (parallel, best-effort) ----
        const now = new Date();
        const updPromises = inserted.map(
          async ({ id, senderId, content, sentAt }) => {
            const disc = discMap.get(senderId);
            if (!disc) return;

            await db.discussions.update(disc.id, {
              lastMessageId: id,
              lastMessageContent: content,
              lastMessageTimestamp: sentAt,
              updatedAt: now,
              lastSyncTimestamp: now,
              unreadCount: disc.unreadCount + 1,
            });
          }
        );

        // Use allSettled so one bad discussion doesn't kill the whole batch
        await Promise.allSettled(updPromises);

        stored = inserted.length;
      });

      return { success: true, newMessagesCount: stored };
    } catch (err) {
      console.error('fetchMessages error:', err);
      return {
        success: false,
        newMessagesCount: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a text message, persist it as sending, send via protocol, and update status.
   * Returns the created message (with final status) on success/failure.
   */
  async sendMessage(message: Message): Promise<SendMessageResult> {
    if (!message.id) {
      return {
        success: false,
        error: 'Message must have an id before sending',
      };
    }

    try {
      const session = useAccountStore.getState().session;
      if (!session) throw new Error('Session module not initialized');
      const peerId = decodeUserId(message.contactUserId);

      // Ensure DB reflects that this message is being (re)sent
      await db.messages.update(message.id, { status: 'sending' });
      // add discussionId to the content prefix
      const contentBytes = strToBytes(message.content);

      // Validate peer ID length
      if (peerId.length !== 32) {
        await db.messages.update(message.id, { status: 'failed' });
        return {
          success: false,
          error: 'Invalid contact userId (must decode to 32 bytes)',
          message: { ...message, status: 'failed' },
        };
      }

      // Ensure session is active before sending
      const status = session.peerSessionStatus(peerId);

      if (status !== SessionStatus.Active) {
        const statusName =
          SessionStatus[status as unknown as number] ?? String(status);
        await db.messages.update(message.id, { status: 'failed' });
        return {
          success: false,
          error: `Session not ready: ${statusName}`,
          message: { ...message, status: 'failed' },
        };
      }

      const sendOutput = session.sendMessage(peerId, contentBytes);

      if (!sendOutput) throw new Error('WASM sendMessage returned null');

      await this.messageProtocol.sendMessage(sendOutput.seeker, {
        seeker: sendOutput.seeker,
        ciphertext: sendOutput.data,
      });

      await db.messages.update(message.id, { status: 'sent' });

      return {
        success: true,
        message: { ...message, id: message.id, status: 'sent' },
      };
    } catch (error) {
      await db.messages.update(message.id, { status: 'failed' });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Send failed',
        message: { ...message, status: 'failed' },
      };
    }
  }
}

export const messageService = new MessageService(createMessageProtocol());
