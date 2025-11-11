import { create } from 'zustand';
import { Discussion, Contact, db } from '../db';
import { createSelectors } from './utils/createSelectors';

interface DiscussionStoreState {
  // Data state
  discussions: Discussion[];
  contacts: Contact[];
  lastMessages: Map<string, { content: string; timestamp: Date }>;
  // Track which discussion modals are open (by discussion ID) to persist across remounts
  openNameModals: Set<number>;

  // Data actions
  loadDiscussions: (userId: string) => Promise<void>;
  loadContacts: (userId: string) => Promise<void>;
  loadDiscussionStoreData: (userId: string) => Promise<void>;
  // UI actions
  setModalOpen: (discussionId: number, isOpen: boolean) => void;
  isModalOpen: (discussionId: number) => boolean;
}

const useDiscussionStoreBase = create<DiscussionStoreState>((set, get) => ({
  // Initial state
  discussions: [],
  contacts: [],
  lastMessages: new Map(),
  areDiscussionsLoaded: false,
  openNameModals: new Set<number>(),

  loadDiscussionStoreData: async (userId: string) => {
    await get().loadDiscussions(userId);
    await get().loadContacts(userId);
  },
  // Actions
  loadDiscussions: async (userId: string) => {
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
      console.error('Failed to load discussions:', error);
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
}));

export const useDiscussionStore = createSelectors(useDiscussionStoreBase);
