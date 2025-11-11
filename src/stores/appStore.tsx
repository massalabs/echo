import { create } from 'zustand';
import { NetworkName } from '@massalabs/massa-web3';
import { createSelectors } from './utils/createSelectors';
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
    await announcementService.fetchAndProcessAnnouncements();
    await messageService.fetchMessages();
  },
}));

export const useAppStore = createSelectors(useAppStoreBase);
