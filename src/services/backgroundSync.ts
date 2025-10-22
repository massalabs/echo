/**
 * Background Sync Service
 *
 * Handles registration of periodic background sync and notification setup.
 * This service initializes the background sync capabilities when the app starts.
 */

import { notificationService } from './notifications';
import { messageReceptionService } from './messageReception';

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

      // Register manual sync trigger
      await this.registerManualSync();

      this.isRegistered = true;
      console.log('Background sync service initialized');
    } catch (error) {
      console.error('Failed to initialize background sync service:', error);
    }
  }

  /**
   * Register periodic background sync
   */
  private async registerPeriodicSync(): Promise<void> {
    if (
      !('serviceWorker' in navigator) ||
      !('sync' in window.ServiceWorkerRegistration.prototype)
    ) {
      console.log(
        'Periodic background sync not supported - using fallback timer'
      );
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      // Register periodic sync (cast to access experimental API)
      await (
        registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }
      ).sync.register('echo-message-sync');
      console.log(
        'Periodic background sync registered - browser will control timing'
      );
      console.log(
        'Note: Browser periodic sync is unreliable and may not run frequently'
      );
    } catch (error) {
      console.error('Failed to register periodic background sync:', error);
      console.log('Falling back to Service Worker timer-based sync');
    }
  }

  /**
   * Register manual sync trigger
   */
  private async registerManualSync(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      // Send message to service worker to register manual sync
      if (registration.active) {
        registration.active.postMessage({
          type: 'REGISTER_MANUAL_SYNC',
        });
      }

      console.log('Manual sync trigger registered');
    } catch (error) {
      console.error('Failed to register manual sync trigger:', error);
    }
  }

  /**
   * Trigger manual message sync
   */
  async triggerManualSync(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported, falling back to direct sync');
      const service = await messageReceptionService.getInstance();
      await service.fetchAllDiscussions();
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      if (registration.active) {
        registration.active.postMessage({
          type: 'SYNC_MESSAGES',
        });
      }
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
