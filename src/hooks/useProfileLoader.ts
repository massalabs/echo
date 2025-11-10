import { useEffect, useCallback } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { db } from '../db';

/**
 * Hook to load user profile from Dexie on app start
 */
export function useProfileLoader() {
  const { setLoading } = useAccountStore();

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      // Add a small delay to ensure database is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const state = useAccountStore.getState();
      const profile =
        state.userProfile || (await db.userProfile.toCollection().first());

      if (profile) {
        // Profile exists - let DiscussionList handle the welcome flow
        useAccountStore.setState({ isInitialized: true });
      } else {
        // No profile exists - show onboarding
        useAccountStore.setState({ isInitialized: false });
      }
    } catch (error) {
      console.error('Error loading user profile from Dexie:', error);
      // On error, assume no profile exists
      useAccountStore.setState({ isInitialized: false });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return { loadProfile };
}
