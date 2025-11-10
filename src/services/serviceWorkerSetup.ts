/**
 * Service Worker Setup
 *
 * Handles service worker registration, message listening, and sync scheduler initialization.
 */

import { useAccountStore } from '../stores/accountStore';

/**
 * Setup service worker: register, listen for messages, and start sync scheduler
 */
export async function setupServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  // Setup message listener for service worker messages (e.g., REQUEST_SEEKERS from service worker)
  setupMessageListener();

  // Register service worker and setup sync scheduler
  await registerAndStartSync();
}

/**
 * Setup message listener for service worker messages
 */
function setupMessageListener(): void {
  navigator.serviceWorker.addEventListener('message', async event => {
    if (event.data && event.data.type === 'REQUEST_SEEKERS') {
      try {
        // Get all active seekers from the session
        const { session } = useAccountStore.getState();
        if (!session) {
          // No session available, respond with empty array
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ seekers: [] });
          }
          return;
        }

        const seekers = session.getMessageBoardReadKeys();
        // Convert Uint8Array[] to number[][] for JSON serialization
        const seekersArray = seekers.map(seeker => Array.from(seeker));

        // Respond via the message channel port
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ seekers: seekersArray });
        }
      } catch (error) {
        console.error('Failed to get seekers for service worker:', error);
        // Respond with empty array on error
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ seekers: [] });
        }
      }
    }

    // Handle notification from service worker when new messages are detected
    if (event.data && event.data.type === 'NEW_MESSAGES_DETECTED') {
      try {
        // Dynamically import to avoid circular dependency
        const { useAppStore } = await import('../stores/appStore');
        const { refreshAppState } = useAppStore.getState();
        await refreshAppState();
      } catch (error) {
        console.error('Failed to refresh app state on new messages:', error);
      }
    }
  });
}

/**
 * Register service worker and start sync scheduler
 */
async function registerAndStartSync(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    if (registrations.length === 0) {
      // No registration found, register manually
      await registerServiceWorker();
    } else {
      // Service worker already registered
      await handleExistingRegistration();
    }
  } catch (error) {
    console.error('App: Error checking service worker registrations:', error);
  }
}

/**
 * Register a new service worker
 */
async function registerServiceWorker(): Promise<void> {
  // Determine the correct service worker URL based on environment
  // In dev with VitePWA, it's typically at /dev-sw.js?dev-sw
  // In production, it's at /sw.js
  const swUrls = import.meta.env.DEV
    ? ['/dev-sw.js?dev-sw', '/sw.js'] // Try dev path first, then fallback
    : ['/sw.js'];

  for (const swUrl of swUrls) {
    try {
      // First, check if the file exists by trying to fetch it
      const response = await fetch(swUrl, { method: 'HEAD' });
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('javascript')
      ) {
        continue;
      }

      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: '/',
      });

      // Wait for service worker to be ready
      if (registration.installing) {
        registration.installing.addEventListener('statechange', event => {
          const sw = event.target as ServiceWorker;
          if (sw.state === 'activated') {
            if (registration.active) {
              registration.active.postMessage({ type: 'START_SYNC_SCHEDULER' });
            }
          }
        });
      } else if (registration.waiting) {
        // Also handle the case where the service worker is waiting to activate
        registration.waiting.addEventListener('statechange', event => {
          const sw = event.target as ServiceWorker;
          if (sw.state === 'activated') {
            if (registration.active) {
              registration.active.postMessage({ type: 'START_SYNC_SCHEDULER' });
            }
          }
        });
      } else if (registration.active) {
        registration.active.postMessage({ type: 'START_SYNC_SCHEDULER' });
      }

      // Success! Exit the loop
      return;
    } catch (_error) {
      // Continue to next URL
    }
  }

  // If we get here, all attempts failed
  console.error(
    'App: Failed to register service worker. Sync will only work when app is open.'
  );
}

/**
 * Handle existing service worker registration
 */
async function handleExistingRegistration(): Promise<void> {
  // Wait for ready and send start message
  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active) {
      registration.active.postMessage({ type: 'START_SYNC_SCHEDULER' });
    }
  } catch (error) {
    console.error('App: Error waiting for service worker ready:', error);
  }
}
