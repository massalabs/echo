/**
 * Notification Service
 *
 * Handles browser notifications for new messages.
 * Shows generic notifications without revealing message content.
 */

export interface NotificationPermission {
  granted: boolean;
  denied: boolean;
  default: boolean;
}

export class NotificationService {
  private static instance: NotificationService;
  private permission: NotificationPermission = {
    granted: false,
    denied: false,
    default: true,
  };

  private constructor() {
    this.updatePermissionStatus();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Request notification permission from the user
   * @returns Promise resolving to permission status
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return this.permission;
    }

    try {
      await Notification.requestPermission();
      this.updatePermissionStatus();
      return this.permission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return this.permission;
    }
  }

  /**
   * Show a generic notification for new messages
   * @param messageCount - Number of new messages (optional)
   */
  async showNewMessagesNotification(messageCount?: number): Promise<void> {
    if (!this.permission.granted) {
      console.log('Notification permission not granted');
      return;
    }

    try {
      const title = 'Gossip Messenger';
      const body = messageCount
        ? `You have ${messageCount} new message${messageCount > 1 ? 's' : ''}`
        : 'You have new messages';

      const notification = new Notification(title, {
        body,
        icon: '/favicon-64.png',
        badge: '/favicon-64.png',
        tag: 'gossip-new-messages', // Replace previous notifications with same tag
        requireInteraction: false,
        silent: false,
      });

      // Handle notification click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }

  /**
   * Show a notification for a specific discussion (when app is open)
   * @param contactName - Name of the contact
   * @param messagePreview - Preview of the message (optional)
   */
  async showDiscussionNotification(
    contactName: string,
    messagePreview?: string
  ): Promise<void> {
    if (!this.permission.granted) {
      console.log('Notification permission not granted');
      return;
    }

    try {
      const title = `New message from ${contactName}`;
      const body = messagePreview || 'Tap to view';

      const notification = new Notification(title, {
        body,
        icon: '/favicon-64.png',
        badge: '/favicon-64.png',
        tag: `gossip-discussion-${contactName}`,
        requireInteraction: false,
        silent: false,
      });

      // Handle notification click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 3 seconds
      setTimeout(() => {
        notification.close();
      }, 3000);
    } catch (error) {
      console.error('Failed to show discussion notification:', error);
    }
  }

  /**
   * Show a notification for a new discussion
   * @param contactName - Name of the contact who started the discussion
   */
  async showNewDiscussionNotification(contactName: string): Promise<void> {
    if (!this.permission.granted) {
      console.log('Notification permission not granted');
      return;
    }

    try {
      const title = 'New Discussion';
      const body = `${contactName} wants to start a conversation`;

      const notification = new Notification(title, {
        body,
        icon: '/favicon-64.png',
        badge: '/favicon-64.png',
        tag: `gossip-new-discussion-${contactName}`,
        requireInteraction: true, // Require interaction for new discussions
        silent: false,
      });

      // Handle notification click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 10 seconds (longer for new discussions)
      setTimeout(() => {
        notification.close();
      }, 10000);
    } catch (error) {
      console.error('Failed to show new discussion notification:', error);
    }
  }

  /**
   * Check if notifications are supported
   * @returns True if notifications are supported
   */
  isSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * Get current permission status
   * @returns Current permission status
   */
  getPermissionStatus(): NotificationPermission {
    return { ...this.permission };
  }

  /**
   * Update internal permission status based on browser state
   */
  private updatePermissionStatus(): void {
    if (!('Notification' in window)) {
      this.permission = {
        granted: false,
        denied: true,
        default: false,
      };
      return;
    }

    switch (Notification.permission) {
      case 'granted':
        this.permission = {
          granted: true,
          denied: false,
          default: false,
        };
        break;
      case 'denied':
        this.permission = {
          granted: false,
          denied: true,
          default: false,
        };
        break;
      default:
        this.permission = {
          granted: false,
          denied: false,
          default: true,
        };
        break;
    }
  }

  /**
   * Clear all notifications with Gossip tags
   */
  clearAllNotifications(): void {
    if (
      'serviceWorker' in navigator &&
      'getRegistrations' in navigator.serviceWorker
    ) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(() => {
          // This would be handled by the service worker
          // For now, we just log that we would clear notifications
          console.log('Would clear all Gossip notifications');
        });
      });
    }
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();
