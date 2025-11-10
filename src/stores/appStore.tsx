import { create } from 'zustand';
import { NetworkName } from '@massalabs/massa-web3';
import { createSelectors } from './utils/createSelectors';
import { useAccountStore } from './accountStore';
import { useDiscussionStore } from './discussionStore';
import { announcementService } from '../services/announcement';
import { messageService } from '../services/message';

interface AppStoreState {
  // Network config (read by accountStore)
  networkName: NetworkName;
  setNetworkName: (networkName: NetworkName) => void;
  // Debug panel visibility
  showDebugPanel: boolean;
  setShowDebugPanel: (show: boolean) => void;
  // Refresh app state (messages, discussions, contacts)
  refreshAppState: () => Promise<void>;
}

const useAppStoreBase = create<AppStoreState>(set => ({
  // Network config
  networkName: NetworkName.Buildnet,
  setNetworkName: (networkName: NetworkName) => {
    set({ networkName });
  },
  // Debug panel visibility
  showDebugPanel: false,
  setShowDebugPanel: (show: boolean) => {
    set({ showDebugPanel: show });
  },
  // Refresh app state
  refreshAppState: async () => {
    const { userProfile } = useAccountStore.getState();
    if (!userProfile?.userId) return;

    const { refreshDiscussions, refreshContacts } =
      useDiscussionStore.getState();

    await announcementService.fetchAndProcessAnnouncements();
    await messageService.fetchMessages();
    await refreshDiscussions(userProfile.userId);
    await refreshContacts(userProfile.userId);
  },
}));

export const useAppStore = createSelectors(useAppStoreBase);
