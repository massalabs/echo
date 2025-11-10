import { useEffect } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { backgroundSyncService } from '../services/backgroundSync';
import { setupServiceWorker } from '../services/serviceWorkerSetup';

/**
 * Hook to initialize background sync and service worker
 * Also triggers message sync when user logs in
 */
export function useBackgroundSync() {
  const { userProfile } = useAccountStore();

  // Initialize background sync and service worker on mount
  useEffect(() => {
    // Initialize background sync service
    backgroundSyncService.initialize().catch(error => {
      console.error('Failed to initialize background sync:', error);
    });

    // Setup service worker: register, listen for messages, and start sync scheduler
    setupServiceWorker().catch(error => {
      console.error('Failed to setup service worker:', error);
    });
  }, []); // Only run once on mount

  // Trigger message sync when user logs in (when userProfile is available)
  useEffect(() => {
    if (userProfile?.userId) {
      console.log('User logged in, triggering message sync');
      backgroundSyncService.triggerManualSync().catch(error => {
        console.error('Failed to sync messages on login:', error);
      });
    }
  }, [userProfile?.userId]);
}
