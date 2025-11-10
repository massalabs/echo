import { useEffect } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { db } from '../db';

const PROFILE_LOAD_DELAY_MS = 100;

/**
 * Hook to load user profile from Dexie on app start
 */
export function useProfileLoader() {
  const { setLoading } = useAccountStore();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);

        // Add a small delay to ensure database is ready
        await new Promise(resolve =>
          setTimeout(resolve, PROFILE_LOAD_DELAY_MS)
        );

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
    };
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
