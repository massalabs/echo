import { create } from 'zustand';
import { Discussion, Contact, db } from '../db';
import { createSelectors } from './utils/createSelectors';

interface DiscussionStoreState {
  // Data state
  discussions: Discussion[];
  contacts: Contact[];
  lastMessages: Map<string, { content: string; timestamp: Date }>;
  areDiscussionsLoaded: boolean;
  // Track which discussion modals are open (by discussion ID) to persist across remounts
  openNameModals: Set<number>;

  // Actions
  loadDiscussions: (userId: string) => Promise<void>;
  loadContacts: (userId: string) => Promise<void>;
  refreshDiscussions: (userId: string) => Promise<void>;
  refreshContacts: (userId: string) => Promise<void>;
  setModalOpen: (discussionId: number, isOpen: boolean) => void;
  isModalOpen: (discussionId: number) => boolean;

  // Selectors (computed)
  getContactByUserId: (userId: string) => Contact | undefined;
  getDiscussionByContactUserId: (
    contactUserId: string
  ) => Discussion | undefined;
}

const useDiscussionStoreBase = create<DiscussionStoreState>((set, get) => ({
  // Initial state
  discussions: [],
  contacts: [],
  lastMessages: new Map(),
  areDiscussionsLoaded: false,
  openNameModals: new Set<number>(),

  // Actions
  loadDiscussions: async (userId: string) => {
    try {
      set({ areDiscussionsLoaded: false });
      if (!userId) {
        set({ discussions: [], lastMessages: new Map() });
        return;
      }
      const discussionsList = await db.getDiscussionsByOwner(userId);
      set({ discussions: discussionsList });

      const messagesMap = new Map<
        string,
        { content: string; timestamp: Date }
      >();
      discussionsList.forEach(discussion => {
        if (discussion.lastMessageContent && discussion.lastMessageTimestamp) {
          messagesMap.set(discussion.contactUserId, {
            content: discussion.lastMessageContent,
            timestamp: discussion.lastMessageTimestamp,
          });
        }
      });
      set({ lastMessages: messagesMap });
    } catch (error) {
      console.error('Failed to load discussions:', error);
    } finally {
      set({ areDiscussionsLoaded: true });
    }
  },

  loadContacts: async (userId: string) => {
    try {
      if (!userId) {
        set({ contacts: [] });
        return;
      }
      const contactsList = await db.getContactsByOwner(userId);
      set({ contacts: contactsList });
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  },

  refreshDiscussions: async (userId: string) => {
    // Refresh without resetting areDiscussionsLoaded to prevent component unmounts
    try {
      if (!userId) {
        set({ discussions: [], lastMessages: new Map() });
        return;
      }
      const discussionsList = await db.getDiscussionsByOwner(userId);
      set({ discussions: discussionsList });

      const messagesMap = new Map<
        string,
        { content: string; timestamp: Date }
      >();
      discussionsList.forEach(discussion => {
        if (discussion.lastMessageContent && discussion.lastMessageTimestamp) {
          messagesMap.set(discussion.contactUserId, {
            content: discussion.lastMessageContent,
            timestamp: discussion.lastMessageTimestamp,
          });
        }
      });
      set({ lastMessages: messagesMap });
    } catch (error) {
      console.error('Failed to refresh discussions:', error);
    }
  },

  refreshContacts: async (userId: string) => {
    await get().loadContacts(userId);
  },

  setModalOpen: (discussionId: number, isOpen: boolean) => {
    const currentModals = get().openNameModals;
    const currentlyOpen = currentModals.has(discussionId);

    // Only create a new Set if the state actually changes
    if (isOpen === currentlyOpen) {
      return; // No change needed
    }

    const openModals = new Set(currentModals);
    if (isOpen) {
      openModals.add(discussionId);
    } else {
      openModals.delete(discussionId);
    }
    set({ openNameModals: openModals });
  },

  isModalOpen: (discussionId: number) => {
    return get().openNameModals.has(discussionId);
  },

  // Selectors
  getContactByUserId: (userId: string) => {
    return get().contacts.find(contact => contact.userId === userId);
  },

  getDiscussionByContactUserId: (contactUserId: string) => {
    return get().discussions.find(d => d.contactUserId === contactUserId);
  },
}));

export const useDiscussionStore = createSelectors(useDiscussionStoreBase);
