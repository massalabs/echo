import { create } from 'zustand';
import { Message, db } from '../db';
import { createSelectors } from './utils/createSelectors';
import { useAccountStore } from './accountStore';
import { messageService } from '../services/message';
import { notificationService } from '../services/notifications';

interface MessageStoreState {
  // Messages keyed by contactUserId (Map for efficient lookups)
  messagesByContact: Map<string, Message[]>;
  // Current contact being viewed
  currentContactUserId: string | null;
  // Loading state (only one discussion can be viewed at a time)
  isLoading: boolean;
  // Sending state (global, since you can only send to one contact at a time)
  isSending: boolean;
  // Syncing state (global)
  isSyncing: boolean;

  // Actions
  setCurrentContact: (contactUserId: string | null) => void;
  loadMessages: (contactUserId: string) => Promise<void>;
  sendMessage: (contactUserId: string, content: string) => Promise<void>;
  resendMessage: (message: Message) => Promise<void>;
  syncMessages: (contactUserId?: string) => Promise<void>;
  addMessage: (contactUserId: string, message: Message) => void;
  updateMessage: (
    contactUserId: string,
    messageId: number,
    updates: Partial<Message>
  ) => void;
  getMessagesForContact: (contactUserId: string) => Message[];
  clearMessages: (contactUserId: string) => void;
}

// Empty array constant to avoid creating new arrays on each call
const EMPTY_MESSAGES: Message[] = [];

// Helper to check if messages actually changed
const messagesChanged = (
  existing: Message[],
  newMessages: Message[]
): boolean => {
  return (
    existing.length !== newMessages.length ||
    existing.some((existing, index) => {
      const newMsg = newMessages[index];
      if (!newMsg) return true; // New message added
      return (
        existing.id !== newMsg.id ||
        existing.content !== newMsg.content ||
        existing.status !== newMsg.status
      );
    }) ||
    newMessages.length > existing.length // New messages at the end
  );
};

// Helper to update messages map immutably
const updateMessagesMap = (
  currentMap: Map<string, Message[]>,
  contactUserId: string,
  updater: (messages: Message[]) => Message[]
): Map<string, Message[]> => {
  const newMap = new Map(currentMap);
  const existing = newMap.get(contactUserId) || [];
  newMap.set(contactUserId, updater(existing));
  return newMap;
};

const useMessageStoreBase = create<MessageStoreState>((set, get) => ({
  // Initial state
  messagesByContact: new Map(),
  currentContactUserId: null,
  isLoading: false,
  isSending: false,
  isSyncing: false,

  // Set current contact (for viewing messages)
  setCurrentContact: (contactUserId: string | null) => {
    const current = get().currentContactUserId;
    // Only update if contact actually changed
    if (current === contactUserId) return;

    set({ currentContactUserId: contactUserId });
    // Auto-load messages when contact is selected
    if (contactUserId) {
      get().loadMessages(contactUserId);
    }
  },

  // Load messages for a contact
  loadMessages: async (contactUserId: string) => {
    const { userProfile } = useAccountStore.getState();
    if (!userProfile?.userId) return;

    try {
      const messageList = await db.getMessagesForContactByOwner(
        userProfile.userId,
        contactUserId
      );
      // Reverse to show oldest messages first (chronological order)
      const newMessages = messageList.reverse();

      // Get existing messages from store
      const existingMessages = get().messagesByContact.get(contactUserId) || [];

      // Only update store if messages actually changed (prevents unnecessary rerenders)
      if (messagesChanged(existingMessages, newMessages)) {
        set({
          messagesByContact: updateMessagesMap(
            get().messagesByContact,
            contactUserId,
            () => newMessages
          ),
        });
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  },

  // Send a message
  sendMessage: async (contactUserId: string, content: string) => {
    const { userProfile } = useAccountStore.getState();
    if (!userProfile?.userId || !content.trim()) return;

    set({ isSending: true });

    try {
      const discussion = await db.getDiscussionByOwnerAndContact(
        userProfile.userId,
        contactUserId
      );

      if (!discussion) {
        throw new Error('Discussion not found');
      }

      // Create message with sending status
      const message: Omit<Message, 'id'> = {
        ownerUserId: userProfile.userId,
        contactUserId,
        content,
        type: 'text',
        direction: 'outgoing',
        status: 'sending',
        timestamp: new Date(),
      };

      // Persist to DB
      const messageId = await db.addMessage(message);
      const messageWithId = { ...message, id: messageId };

      // Add to store immediately
      get().addMessage(contactUserId, messageWithId);

      // Send via service
      const result = await messageService.sendMessage(messageWithId);

      // Update status
      if (result.message) {
        get().updateMessage(contactUserId, messageId, {
          status: result.message.status,
        });
      } else if (!result.success) {
        get().updateMessage(contactUserId, messageId, { status: 'failed' });
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    } finally {
      set({ isSending: false });
    }
  },

  // Resend a failed message
  resendMessage: async (message: Message) => {
    if (!message.id) return;

    set({ isSending: true });

    try {
      // Optimistically update status
      get().updateMessage(message.contactUserId, message.id, {
        status: 'sending',
      });

      const result = await messageService.sendMessage(message);

      if (result.message) {
        get().updateMessage(message.contactUserId, message.id, {
          status: result.message.status,
        });
      } else if (!result.success) {
        get().updateMessage(message.contactUserId, message.id, {
          status: 'failed',
        });
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to resend message:', error);
      get().updateMessage(message.contactUserId, message.id, {
        status: 'failed',
      });
      throw error;
    } finally {
      set({ isSending: false });
    }
  },

  // Sync messages (fetch new ones from server)
  syncMessages: async (contactUserId?: string) => {
    if (get().isSyncing) return;
    set({ isSyncing: true });

    try {
      const fetchResult = await messageService.fetchMessages();

      if (fetchResult.success && fetchResult.newMessagesCount > 0) {
        // Reload messages for the current contact if specified, or all contacts
        if (contactUserId) {
          await get().loadMessages(contactUserId);

          // Show notification if app is in background
          if (document.hidden) {
            const contact = await db
              .getContactByOwnerAndUserId(
                useAccountStore.getState().userProfile?.userId || '',
                contactUserId
              )
              .catch(() => null);
            if (contact) {
              await notificationService.showDiscussionNotification(
                contact.name,
                'New message received'
              );
            }
          }
        } else {
          // Reload all contacts' messages
          const { userProfile } = useAccountStore.getState();
          if (userProfile?.userId) {
            const contacts = await db.getContactsByOwner(userProfile.userId);
            await Promise.all(
              contacts.map(contact => get().loadMessages(contact.userId))
            );
          }
        }
      }
    } catch (error) {
      console.error('Failed to sync messages:', error);
    } finally {
      set({ isSyncing: false });
    }
  },

  // Add a message to the store
  addMessage: (contactUserId: string, message: Message) => {
    set({
      messagesByContact: updateMessagesMap(
        get().messagesByContact,
        contactUserId,
        existing => [...existing, message]
      ),
    });
  },

  // Update a message in the store
  updateMessage: (
    contactUserId: string,
    messageId: number,
    updates: Partial<Message>
  ) => {
    set({
      messagesByContact: updateMessagesMap(
        get().messagesByContact,
        contactUserId,
        messages =>
          messages.map(m => (m.id === messageId ? { ...m, ...updates } : m))
      ),
    });
  },

  // Get messages for a contact
  getMessagesForContact: (contactUserId: string) => {
    return get().messagesByContact.get(contactUserId) || EMPTY_MESSAGES;
  },

  // Clear messages for a contact
  clearMessages: (contactUserId: string) => {
    const newMap = new Map(get().messagesByContact);
    newMap.delete(contactUserId);
    set({ messagesByContact: newMap });
  },
}));

export const useMessageStore = createSelectors(useMessageStoreBase);
