/**
 * Background Sync Service
 *
 * Handles registration of periodic background sync and notification setup.
 * This service initializes the background sync capabilities when the app starts.
 */

import { notificationService } from './notifications';
import { messageService } from './message';
import { announcementService } from './announcement';
import { defaultSyncConfig } from '../config/sync';

export class BackgroundSyncService {
  private static instance: BackgroundSyncService;
  private isRegistered = false;

  private constructor() {}

  static getInstance(): BackgroundSyncService {
    if (!BackgroundSyncService.instance) {
      BackgroundSyncService.instance = new BackgroundSyncService();
    }
    return BackgroundSyncService.instance;
  }

  /**
   * Initialize background sync and notifications
   * This should be called when the app starts
   */
  async initialize(): Promise<void> {
    try {
      // Request notification permission
      await notificationService.requestPermission();

      // Register periodic background sync
      await this.registerPeriodicSync();

      this.isRegistered = true;
      console.log('Background sync service initialized');

      // Auto-retry pending announcements when coming back online
      if (typeof window !== 'undefined' && 'addEventListener' in window) {
        window.addEventListener('online', () => {
          void this.triggerManualSync();
        });
      }
    } catch (error) {
      console.error('Failed to initialize background sync service:', error);
    }
  }

  /**
   * Register periodic background sync
   * Note: On mobile devices, browsers may throttle or delay syncs significantly
   * Requesting 5 minutes, but actual syncs may be much less frequent
   */
  private async registerPeriodicSync(): Promise<void> {
    if (
      !('serviceWorker' in navigator) ||
      !('sync' in window.ServiceWorkerRegistration.prototype)
    ) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      // Use centralized sync config
      const PERIODIC_SYNC_MIN_INTERVAL_MS =
        defaultSyncConfig.periodicSyncMinIntervalMs;

      // Register periodic sync with minInterval parameter
      // Type assertion needed for experimental API
      const periodicSync = (
        registration as ServiceWorkerRegistration & {
          periodicSync?: {
            register: (
              tag: string,
              options?: { minInterval?: number }
            ) => Promise<void>;
          };
        }
      ).periodicSync;

      if (periodicSync) {
        await periodicSync.register('gossip-message-sync', {
          minInterval: PERIODIC_SYNC_MIN_INTERVAL_MS,
        });
      } else {
        // Fallback for browsers that don't support periodicSync but support sync
        await (
          registration as ServiceWorkerRegistration & {
            sync: { register: (tag: string) => Promise<void> };
          }
        ).sync.register('gossip-message-sync');
      }
    } catch (error) {
      // Silently handle permission errors (expected in many browsers)
      // Only log unexpected errors
      if (
        !(error instanceof DOMException && error.name === 'NotAllowedError')
      ) {
        console.error('Failed to register periodic background sync:', error);
      }
    }
  }

  /**
   * Trigger manual message sync
   */
  async triggerManualSync(): Promise<void> {
    try {
      // Sync directly - faster and more efficient when app is open
      // Manual sync is typically user-triggered, so app is likely active
      await Promise.all([
        announcementService.fetchAndProcessAnnouncements(),
        messageService.fetchMessages(),
      ]);
    } catch (error) {
      console.error('Failed to trigger manual sync:', error);
    }
  }

  /**
   * Check if background sync is registered
   */
  isBackgroundSyncRegistered(): boolean {
    return this.isRegistered;
  }

  /**
   * Check if notifications are supported
   */
  isNotificationSupported(): boolean {
    return notificationService.isSupported();
  }

  /**
   * Get notification permission status
   */
  getNotificationPermission(): ReturnType<
    typeof notificationService.getPermissionStatus
  > {
    return notificationService.getPermissionStatus();
  }
}

// Export singleton instance
export const backgroundSyncService = BackgroundSyncService.getInstance();
