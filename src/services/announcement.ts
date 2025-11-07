/**
 * Announcement Service
 *
 * Handles broadcasting and processing of session announcements.
 */

import { db } from '../db';
import { notificationService } from './notifications';
import { encodeUserId } from '../utils/userId';
import { processIncomingAnnouncement } from '../crypto/discussionInit';
import { useAccountStore } from '../stores/accountStore';
import {
  createMessageProtocol,
  IMessageProtocol,
} from '../api/messageProtocol';

export interface AnnouncementReceptionResult {
  success: boolean;
  newDiscussionsCount: number;
  error?: string;
}

export class AnnouncementService {
  constructor(public readonly messageProtocol: IMessageProtocol) {}

  async sendAnnouncement(announcement: Uint8Array): Promise<{
    success: boolean;
    counter?: string;
    error?: string;
  }> {
    try {
      const counter = await this.messageProtocol.sendAnnouncement(announcement);
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
          } else if (result.error) {
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
      } else if (result.error) {
        console.error('Failed to simulate incoming discussion:', result.error);
        return { success: false, newMessagesCount: 0, error: result.error };
      } else {
        return { success: false, newMessagesCount: 0 };
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
      const announcements = await this.messageProtocol.fetchAnnouncements();
      return announcements;
    } catch (error) {
      console.error('Failed to fetch incoming announcements:', error);
      return [];
    }
  }

  /**
   * Generates a temporary contact name for new incoming requests.
   * TODO: Replace with a better naming scheme.
   */
  private async _generateTemporaryContactName(
    ownerUserId: string
  ): Promise<string> {
    // Find all contacts with names starting with "New Request"
    // and extract the maximum number suffix
    const newRequestContacts = await db.contacts
      .where('ownerUserId')
      .equals(ownerUserId)
      .filter(contact => contact.name.startsWith('New Request'))
      .toArray();

    // Extract numbers from names like "New Request 1", "New Request 2", etc.
    const numbers = newRequestContacts
      .map(c => {
        const match = c.name.match(/^New Request (\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);

    const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNumber = maxNumber + 1;

    return `New Request ${nextNumber}`;
  }

  private async _processIncomingAnnouncement(
    announcementData: Uint8Array
  ): Promise<{
    success: boolean;
    discussionId?: number;
    contactUserId?: string;
    error?: string;
  }> {
    const { ourPk, ourSk, session } = useAccountStore.getState();
    if (!ourPk || !ourSk) throw new Error('WASM keys unavailable');
    if (!session) throw new Error('Session module not initialized');
    try {
      const announcerPkeys = session.feedIncomingAnnouncement(
        announcementData,
        ourPk,
        ourSk
      );

      // if we can't decrypt the announcement, it means we are not the intended recipient. It's not an error.
      if (!announcerPkeys) {
        return {
          success: false,
          error:
            'Failed to decrypt announcement - not intended recipient or malformed data',
        };
      }
      const contactUserId = announcerPkeys.derive_id();
      const contactUserIdString = encodeUserId(contactUserId);

      const ownerUserId = useAccountStore.getState().userProfile?.userId;
      if (!ownerUserId) throw new Error('No authenticated user');
      let contact = await db.getContactByOwnerAndUserId(
        ownerUserId,
        contactUserIdString
      );

      if (!contact) {
        const contactName =
          await this._generateTemporaryContactName(ownerUserId);

        await db.contacts.add({
          ownerUserId,
          userId: contactUserIdString,
          name: contactName,
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

export const announcementService = new AnnouncementService(
  createMessageProtocol()
);
