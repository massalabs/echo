/**
 * Message Reception Service
 *
 * Handles fetching encrypted messages from the protocol and decrypting them.
 * This service works both in the main app context and Service Worker context.
 */

import { db, Message } from '../db';
import { decodeUserId, encodeUserId } from '../utils/userId';
import {
  IMessageProtocol,
  createMessageProtocol,
} from '../api/messageProtocol';
import { useAccountStore } from '../stores/accountStore';
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
      let totalStored = 0;
      const maxIterations = 100; // Safety limit to prevent infinite loops
      let iteration = 0;

      // -------------------------------------------------
      // Loop until no new messages are found
      // Each iteration processes messages and advances seekers,
      // so we need to fetch again with the new seekers
      // -------------------------------------------------
      while (iteration < maxIterations) {
        iteration++;

        // Get current seekers (these advance after each message is processed)
        const seekers = session.getMessageBoardReadKeys();
        if (!seekers?.length) break;

        // Fetch encrypted messages for current seekers
        const encrypted = await this.messageProtocol.fetchMessages(seekers);
        if (!encrypted.length) break; // No more messages available

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

        if (!decrypted.length) break; // No valid messages in this batch

        // -------------------------------------------------
        // 2. One transaction → parallel DB work
        // -------------------------------------------------
        let stored = 0;

        await db.transaction('rw', db.messages, db.discussions, async () => {
          // ---- 2a. Pre-load all discussions (parallel) ----
          const discPromises = decrypted.map(async ({ senderId }) => {
            const d = await db.getDiscussionByOwnerAndContact(
              ownerUserId,
              senderId
            );
            if (!d) throw new Error(`Discussion missing for ${senderId}`);
            return { senderId, discussion: d };
          });
          const discResults = await Promise.all(discPromises);
          const discMap = new Map(
            discResults.map(r => [r.senderId, r.discussion])
          );

          // ---- 2b. Insert messages (parallel) ----
          const msgPromises = decrypted.map(
            async ({ content, sentAt, senderId }) => {
              const id = await db.messages.add({
                ownerUserId,
                contactUserId: senderId,
                content,
                type: 'text' as const,
                direction: 'incoming' as const,
                status: 'delivered' as const,
                timestamp: sentAt,
                encrypted: true,
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

        totalStored += stored;

        // If we processed fewer messages than we fetched, we might have hit the end
        // Continue to next iteration to check for more messages with updated seekers
      }

      if (iteration >= maxIterations) {
        console.warn(
          `fetchMessages reached max iterations (${maxIterations}), stopping to prevent infinite loop`
        );
      }

      return { success: true, newMessagesCount: totalStored };
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
          message: { ...message, id: message.id, status: 'failed' },
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
          message: { ...message, id: message.id, status: 'failed' },
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
        message: { ...message, id: message.id, status: 'failed' },
      };
    }
  }
}

export const messageService = new MessageService(createMessageProtocol());
