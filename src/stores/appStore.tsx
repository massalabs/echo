import { create } from 'zustand';
import { NetworkName } from '@massalabs/massa-web3';
import { createSelectors } from './utils/createSelectors';

interface AppStoreState {
  // Network config (read by accountStore)
  networkName: NetworkName;
  setNetworkName: (networkName: NetworkName) => void;
  // Debug panel visibility
  showDebugPanel: boolean;
  setShowDebugPanel: (show: boolean) => void;
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
}));

export const useAppStore = createSelectors(useAppStoreBase);
