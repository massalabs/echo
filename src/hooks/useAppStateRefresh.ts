import { useEffect } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { useAppStore } from '../stores/appStore';
import { defaultSyncConfig } from '../config/sync';

/**
 * Hook to refresh app state periodically when user is logged in
 * Refreshes announcements, messages, discussions, and contacts
 */
export function useAppStateRefresh() {
  const { userProfile } = useAccountStore();

  useEffect(() => {
    if (userProfile?.userId) {
      const { refreshAppState } = useAppStore.getState();

      // Initial refresh on login
      refreshAppState().catch(error => {
        console.error('Failed to refresh app state on login:', error);
      });

      const REFRESH_INTERVAL_MS = defaultSyncConfig.activeSyncIntervalMs;
      const refreshInterval = setInterval(() => {
        refreshAppState().catch(error => {
          console.error('Failed to refresh app state periodically:', error);
        });
      }, REFRESH_INTERVAL_MS);

      // Cleanup interval when user logs out or component unmounts
      return () => {
        clearInterval(refreshInterval);
        console.log('Periodic app state refresh interval cleared');
      };
    }
  }, [userProfile?.userId]);
}
