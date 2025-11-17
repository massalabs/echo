import { useEffect, useState } from 'react';
import { db } from '../db';
import { STORAGE_KEYS, clearAppStorage } from '../utils/localStorage';
import { useLocalStorage } from './useLocalStorage';

const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev-local';

export function useVersionCheck() {
  const [storedVersion, setStoredVersion] = useLocalStorage<string | null>(
    STORAGE_KEYS.APP_VERSION,
    null
  );
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  useEffect(() => {
    console.log(
      `Current app version: ${CURRENT_VERSION}, stored version: ${storedVersion}`
    );

    if (storedVersion && storedVersion !== CURRENT_VERSION) {
      // Version changed → show update prompt
      setShowUpdatePrompt(true);
    } else if (storedVersion === null || storedVersion === CURRENT_VERSION) {
      // First load or same version → store current version
      setStoredVersion(CURRENT_VERSION);
    }
  }, [storedVersion, setStoredVersion, CURRENT_VERSION]);

  const isVersionDifferent =
    storedVersion !== null && storedVersion !== CURRENT_VERSION;

  const dismissUpdate = () => {
    setShowUpdatePrompt(false);
    // Don't update the stored version - let user decide later via Settings
  };

  const handleForceUpdate = async () => {
    try {
      // 1. Clear all caches
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      // 2. Remove IndexedDB databases
      await db.deleteDb();

      // 3. Clear app-specific localStorage keys
      clearAppStorage();

      // 4. Unregister service workers
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }

      // 5. Reload the page → everything will be fresh
      window.location.reload();
    } catch (err) {
      console.error('Clean failed:', err);
      window.location.reload();
    }
  };

  return {
    showUpdatePrompt,
    handleForceUpdate,
    isVersionDifferent,
    dismissUpdate,
  };
}
