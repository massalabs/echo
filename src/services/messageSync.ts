/**
 * Message Sync Utilities
 *
 * Handles manual message sync. Initialization is handled by setupServiceWorker.
 */

import { messageService } from './message';
import { announcementService } from './announcement';

/**
 * Trigger manual message sync
 */
export async function triggerManualSync(): Promise<void> {
  try {
    await Promise.all([
      announcementService.fetchAndProcessAnnouncements(),
      messageService.fetchMessages(),
    ]);
  } catch (error) {
    console.error('Failed to trigger manual sync:', error);
  }
}
