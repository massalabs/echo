/**
 * Announcement Service
 *
 * Handles broadcasting and processing of session announcements.
 */

import { db } from '../db';
import { notificationService } from './notifications';
import bs58check from 'bs58check';
import { processIncomingAnnouncement } from '../crypto/discussionInit';
import { useAccountStore } from '../stores/accountStore';
import { getSessionModule } from '../wasm';
import {
  IMessageProtocol,
  createMessageProtocol,
} from '../api/messageProtocol';

export interface AnnouncementReceptionResult {
  success: boolean;
  newDiscussionsCount: number;
  error?: string;
}

export class AnnouncementService {
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

  async sendAnnouncement(announcement: Uint8Array): Promise<{
    success: boolean;
    counter?: string;
    error?: string;
  }> {
    try {
      const protocol = await this.getMessageProtocol();
      const counter = await protocol.sendAnnouncement(announcement);
      return { success: true, counter };
    } catch (error) {
      console.error('Failed to broadcast outgoing session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async fetchAndProcessAnnouncements(): Promise<AnnouncementReceptionResult> {
    try {
      const announcements = await this._fetchAnnouncements();

      let newDiscussionsCount = 0;
      let hasErrors = false;

      for (const announcement of announcements) {
        try {
          const result = await this._processIncomingAnnouncement(announcement);
          if (result.success) {
            newDiscussionsCount++;
          } else {
            hasErrors = true;
          }
        } catch (error) {
          console.error('Failed to process incoming announcement:', error);
          hasErrors = true;
        }
      }

      return {
        success: !hasErrors || newDiscussionsCount > 0,
        newDiscussionsCount,
        error: hasErrors ? 'Some announcements failed to process' : undefined,
      };
    } catch (error) {
      console.error('Failed to fetch/process incoming announcements:', error);
      return {
        success: false,
        newDiscussionsCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async simulateIncomingDiscussion(): Promise<{
    success: boolean;
    newMessagesCount: number;
    error?: string;
  }> {
    try {
      console.log('Simulating incoming discussion announcement...');
      const mockAnnouncement = new Uint8Array(64);
      crypto.getRandomValues(mockAnnouncement);
      const result = await this._processIncomingAnnouncement(mockAnnouncement);
      if (result.success) {
        console.log(
          'Successfully simulated incoming discussion:',
          result.discussionId
        );
        return { success: true, newMessagesCount: 1 };
      } else {
        console.error('Failed to simulate incoming discussion:', result.error);
        return { success: false, newMessagesCount: 0, error: result.error };
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

  private async _fetchAnnouncements(): Promise<Uint8Array[]> {
    try {
      const messageProtocol = await this.getMessageProtocol();
      const announcements = await messageProtocol.fetchAnnouncements();
      return announcements;
    } catch (error) {
      console.error('Failed to fetch incoming announcements:', error);
      return [];
    }
  }

  private async _processIncomingAnnouncement(
    announcementData: Uint8Array
  ): Promise<{
    success: boolean;
    discussionId?: number;
    contactUserId?: string;
    error?: string;
  }> {
    const { ourPk, ourSk } = useAccountStore.getState();
    if (!ourPk || !ourSk) throw new Error('WASM keys unavailable');
    try {
      const sessionModule = await getSessionModule();
      const announcerPkeys = await sessionModule.feedIncomingAnnouncement(
        announcementData,
        ourPk,
        ourSk
      );

      if (!announcerPkeys) {
        throw new Error(
          'Could not extract announcer public keys from announcement'
        );
      }
      const contactUserId = announcerPkeys.derive_id();
      const contactUserIdString = bs58check.encode(contactUserId);

      const ownerUserId = useAccountStore.getState().userProfile?.userId;
      if (!ownerUserId) throw new Error('No authenticated user');
      let contact = await db.getContactByOwnerAndUserId(
        ownerUserId,
        contactUserIdString
      );
      if (!contact) {
        contact = await db.contacts.add({
          ownerUserId,
          userId: contactUserIdString,
          name: `User ${contactUserIdString.substring(0, 8)}`,
          publicKeys: announcerPkeys.to_bytes(),
          avatar: undefined,
          isOnline: false,
          lastSeen: new Date(),
          createdAt: new Date(),
        });
        contact = await db.getContactByOwnerAndUserId(
          ownerUserId,
          contactUserIdString
        );
      }

      if (!contact) {
        throw new Error('Could not find contact');
      }

      const { discussionId } = await processIncomingAnnouncement(
        contact,
        announcementData
      );

      try {
        await notificationService.showNewDiscussionNotification(
          contact?.name || `User ${contactUserIdString.substring(0, 8)}`
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
        contactUserId: contactUserIdString,
      };
    } catch (error) {
      console.error('Failed to process incoming announcement:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

let _announcementService: AnnouncementService | null = null;

export const announcementService = {
  async getInstance(): Promise<AnnouncementService> {
    if (!_announcementService) {
      _announcementService = new AnnouncementService();
      await _announcementService.getMessageProtocol();
    }
    return _announcementService;
  },
};
