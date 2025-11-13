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
  EncryptedMessage,
} from '../api/messageProtocol';
import { useAccountStore } from '../stores/accountStore';
import { strToBytes } from '@massalabs/massa-web3';
import {
  SessionStatus,
  UserSecretKeys,
} from '../assets/generated/wasm/gossip_wasm';
import { SessionModule } from '../wasm';

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

interface Decrypted {
  content: string;
  sentAt: Date;
  senderId: string;
}

const LIMIT_FETCH_ITERATIONS = 30;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export class MessageService {
  constructor(public readonly messageProtocol: IMessageProtocol) {}

  /**
   * Fetch new encrypted messages for a specific discussion
   * @returns Result with count of new messages fetched
   */
  async fetchMessages(): Promise<MessageResult> {
    try {
      const { session, ourSk, userProfile } = useAccountStore.getState();
      if (!session) throw new Error('Session module not initialized');
      if (!ourSk) throw new Error('WASM secret keys unavailable');
      if (!userProfile?.userId) throw new Error('No authenticated user');

      let previousSeekers: Set<string> = new Set();
      let iterations = 0;
      let newMessagesCount = 0;

      while (true) {
        const seekers = session.getMessageBoardReadKeys();
        const seekerStrings = seekers.map(s =>
          Buffer.from(s).toString('base64')
        );
        const currentSeekers = new Set(seekerStrings);

        const allSame =
          seekerStrings.length === previousSeekers.size &&
          [...seekerStrings].every(s => previousSeekers.has(s));

        if (allSame || iterations >= LIMIT_FETCH_ITERATIONS) {
          break;
        }

        const encryptedMessages =
          await this.messageProtocol.fetchMessages(seekers);
        previousSeekers = currentSeekers;

        if (encryptedMessages.length === 0) {
          continue;
        }

        const decryptedMessages = this.decryptMessages(
          encryptedMessages,
          session,
          ourSk
        );

        const storedMessagesIds = await this.storeDecryptedMessages(
          decryptedMessages,
          userProfile.userId
        );

        newMessagesCount += storedMessagesIds.length;
        iterations += 1;
        // Small delay to avoid tight loop
        await sleep(100);
      }

      return {
        success: true,
        newMessagesCount,
      };
    } catch (err) {
      return {
        success: false,
        newMessagesCount: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private decryptMessages(
    encrypted: EncryptedMessage[],
    session: SessionModule,
    ourSk: UserSecretKeys
  ): Decrypted[] {
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
    return decrypted;
  }

  private async storeDecryptedMessages(
    decrypted: Decrypted[],
    ownerUserId: string
  ): Promise<number[]> {
    if (!decrypted.length) return [];

    const ids: number[] = [];

    decrypted.map(async message => {
      const discussion = await db.getDiscussionByOwnerAndContact(
        ownerUserId,
        message.senderId
      );

      if (!discussion) {
        // Skip messages without existing discussion: Should not happen normally
        console.error(
          'No discussion found for incoming message from',
          message.senderId
        );
        return;
      }

      const id = await db.messages.add({
        ownerUserId,
        contactUserId: discussion.contactUserId,
        content: message.content,
        type: 'text' as const,
        direction: 'incoming' as const,
        status: 'delivered' as const,
        timestamp: message.sentAt,
        metadata: {},
      });

      const now = new Date();
      await db.discussions.update(discussion.id, {
        lastMessageId: id,
        lastMessageContent: message.content,
        lastMessageTimestamp: message.sentAt,
        updatedAt: now,
        lastSyncTimestamp: now,
        unreadCount: discussion.unreadCount + 1,
      });

      ids.push(id);
    });

    return ids;
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

      await this.messageProtocol.sendMessage({
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
