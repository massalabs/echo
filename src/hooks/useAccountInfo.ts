import { useEffect, useState } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { UserProfile } from '../db';

/**
 * Hook to load existing account info to show username in WelcomeBack when unauthenticated
 */
export function useAccountInfo() {
  const { isInitialized, userProfile } = useAccountStore();
  const [existingAccountInfo, setExistingAccountInfo] =
    useState<UserProfile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (isInitialized && !userProfile) {
          const info = await useAccountStore
            .getState()
            .getExistingAccountInfo();
          setExistingAccountInfo(info);
        }
      } catch (_e) {
        setExistingAccountInfo(null);
      }
    })();
  }, [isInitialized, userProfile]);

  return existingAccountInfo;
}
