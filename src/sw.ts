/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

// Service Worker event types
interface SyncEvent extends Event {
  tag: string;
  waitUntil(promise: Promise<void>): void;
}

interface NotificationEvent extends Event {
  notification: Notification;
  waitUntil(promise: Promise<void>): void;
}

// Import message reception service (will be available in Service Worker context)
// Note: In a real implementation, you'd need to ensure WASM modules work in SW context
// For now, we'll use a simplified version that only fetches encrypted messages

interface EncryptedMessage {
  id: string;
  ciphertext: Uint8Array;
  ct: Uint8Array;
  rand: Uint8Array;
  nonce: Uint8Array;
  messageType: 'initiation' | 'response' | 'regular';
  direction: 'incoming' | 'outgoing';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface Discussion {
  id: number;
  contactUserId: string;
  discussionKey: string;
  lastSyncTimestamp?: Date;
}

// Mock protocol API for Service Worker context
class ServiceWorkerMessageProtocol {
  private baseUrl = 'http://localhost:3000/api';

  async fetchMessages(discussionKey: string): Promise<EncryptedMessage[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/messages/${encodeURIComponent(discussionKey)}`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data.map(
        (msg: {
          ciphertext: number[];
          ct: number[];
          rand: number[];
          nonce: number[];
          timestamp: string;
          [key: string]: unknown;
        }) => ({
          ...msg,
          ciphertext: new Uint8Array(msg.ciphertext),
          ct: new Uint8Array(msg.ct),
          rand: new Uint8Array(msg.rand),
          nonce: new Uint8Array(msg.nonce),
          timestamp: new Date(msg.timestamp),
        })
      );
    } catch (error) {
      console.error('Failed to fetch messages in Service Worker:', error);
      return [];
    }
  }
}

// Service Worker message reception logic
class ServiceWorkerMessageReception {
  private protocol = new ServiceWorkerMessageProtocol();

  async fetchAllDiscussions(): Promise<{
    success: boolean;
    newMessagesCount: number;
  }> {
    try {
      // In a real implementation, you'd access IndexedDB here
      // For now, we'll simulate fetching discussions
      const discussions: Discussion[] = await this.getActiveDiscussions();

      let totalNewMessages = 0;

      for (const discussion of discussions) {
        try {
          const messages = await this.protocol.fetchMessages(
            discussion.discussionKey
          );
          // Store encrypted messages in IndexedDB
          await this.storeEncryptedMessages(discussion.id, messages);
          totalNewMessages += messages.length;
        } catch (error) {
          console.error(
            `Failed to fetch messages for discussion ${discussion.id}:`,
            error
          );
        }
      }

      return {
        success: true,
        newMessagesCount: totalNewMessages,
      };
    } catch (error) {
      console.error('Failed to fetch messages for all discussions:', error);
      return {
        success: false,
        newMessagesCount: 0,
      };
    }
  }

  private async getActiveDiscussions(): Promise<Discussion[]> {
    try {
      const db = await this.openEchoDB();
      const tx = db.transaction('discussions', 'readonly');
      const store = tx.objectStore('discussions');
      const index = store.index('status');
      const request = index.getAll('active');

      const discussions = await new Promise<Discussion[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });

      // Note: discussions in DB do not currently store discussionKey.
      // For SW fetching, we require it; if absent, skip fetching for that discussion.
      return discussions
        .map(
          (d: {
            id: number;
            contactUserId: string;
            discussionKey?: string;
            lastSyncTimestamp?: Date | string;
          }) => ({
            id: d.id as number,
            contactUserId: d.contactUserId as string,
            discussionKey: d.discussionKey || '',
            lastSyncTimestamp: d.lastSyncTimestamp
              ? new Date(d.lastSyncTimestamp)
              : undefined,
          })
        )
        .filter(d => !!d.discussionKey);
    } catch (error) {
      console.error(
        'Service Worker: Failed to read active discussions from IndexedDB',
        error
      );
      return [];
    }
  }

  private async openEchoDB(): Promise<IDBDatabase> {
    return await new Promise((resolve, reject) => {
      const request = self.indexedDB.open('EchoDatabase', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        console.warn('Service Worker: IndexedDB open is blocked');
      request.onupgradeneeded = () => {
        // DB is created by app with Dexie; SW should not define schema here.
        // If we ever land here, just proceed; stores may be missing.
        resolve(request.result);
      };
    });
  }

  private async storeEncryptedMessages(
    discussionId: number,
    messages: EncryptedMessage[]
  ): Promise<void> {
    if (!messages.length) return;
    try {
      const db = await this.openEchoDB();
      const tx = db.transaction('discussionMessages', 'readwrite');
      const store = tx.objectStore('discussionMessages');

      await Promise.all(
        messages.map(
          msg =>
            new Promise<void>((resolve, reject) => {
              const addReq = store.add({
                discussionId,
                messageType: msg.messageType,
                direction: 'incoming',
                ciphertext: msg.ciphertext,
                ct: msg.ct,
                rand: msg.rand,
                nonce: msg.nonce,
                status: 'delivered',
                timestamp: msg.timestamp,
                metadata: msg.metadata || undefined,
              });
              addReq.onsuccess = () => resolve();
              addReq.onerror = () => reject(addReq.error);
            })
        )
      );

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      console.error(
        'Service Worker: Failed to store encrypted messages',
        error
      );
    }
  }
}

const messageReception = new ServiceWorkerMessageReception();

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();

  // Handle manual sync requests
  if (event.data && event.data.type === 'SYNC_MESSAGES') {
    event.waitUntil(
      messageReception.fetchAllDiscussions().then(result => {
        if (result.success && result.newMessagesCount > 0) {
          // Show notification for new messages
          self.registration.showNotification('Echo Messenger', {
            body: `You have ${result.newMessagesCount} new message${result.newMessagesCount > 1 ? 's' : ''}`,
            icon: '/favicon-64.png',
            badge: '/favicon-64.png',
            tag: 'echo-new-messages',
            requireInteraction: false,
          });
        }
      })
    );
  }
});

// Register periodic background sync
self.addEventListener('sync', (event: Event) => {
  console.log(
    'Service Worker: Periodic sync event triggered',
    (event as SyncEvent).tag
  );
  if ((event as SyncEvent).tag === 'echo-message-sync') {
    (event as SyncEvent).waitUntil(
      messageReception
        .fetchAllDiscussions()
        .then(result => {
          console.log('Service Worker: Periodic sync completed', result);
          if (result.success && result.newMessagesCount > 0) {
            // Show notification for new messages
            self.registration.showNotification('Echo Messenger', {
              body: `You have ${result.newMessagesCount} new message${result.newMessagesCount > 1 ? 's' : ''}`,
              icon: '/favicon-64.png',
              badge: '/favicon-64.png',
              tag: 'echo-new-messages',
              requireInteraction: false,
            });
          }
        })
        .catch(error => {
          console.error('Service Worker: Periodic sync failed', error);
        })
    );
  }
});

// Fallback timer-based sync (runs every 5 minutes - reduced frequency since we sync on login)
function startFallbackSync() {
  // Check if we're in service worker context
  if (typeof self === 'undefined' || !self.registration) {
    console.log('Not in service worker context, skipping fallback sync setup');
    return;
  }

  console.log('Service Worker: Starting fallback sync timer (5 minutes)');
  const syncTimer = setInterval(
    async () => {
      console.log('Service Worker: Fallback sync timer triggered');
      try {
        const result = await messageReception.fetchAllDiscussions();
        console.log('Service Worker: Fallback sync completed', result);
        if (result.success && result.newMessagesCount > 0) {
          // Show generic notification for new messages/discussions
          self.registration.showNotification('Echo Messenger', {
            body: `You have ${result.newMessagesCount} new message${result.newMessagesCount > 1 ? 's' : ''}`,
            icon: '/favicon-64.png',
            badge: '/favicon-64.png',
            tag: 'echo-new-messages',
            requireInteraction: false,
          });
        }
      } catch (error) {
        console.error('Service Worker: Fallback sync failed', error);
      }
    },
    5 * 60 * 1000
  ); // 5 minutes

  // Store timer reference for potential cleanup
  (
    self as ServiceWorkerGlobalScope & {
      echoSyncTimer?: ReturnType<typeof setInterval>;
    }
  ).echoSyncTimer = syncTimer;
}

// Start fallback sync when service worker activates
self.addEventListener('activate', () => {
  console.log('Service Worker: Activated, starting fallback sync');
  startFallbackSync();
});

// Handle notification clicks
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window' })
      .then((clientList: readonly WindowClient[]) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            client.focus();
            return;
          }
        }
        // Otherwise, open a new window
        if (self.clients.openWindow) {
          self.clients.openWindow('/');
        }
      })
  );
});

// self.__WB_MANIFEST is the default injection point
precacheAndRoute(self.__WB_MANIFEST);

// clean old assets
cleanupOutdatedCaches();

/** @type {RegExp[] | undefined} */
let allowlist;
// in dev mode, we disable precaching to avoid caching issues
if (import.meta.env.DEV) allowlist = [/^\/$/];

// to allow work offline
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { allowlist })
);
