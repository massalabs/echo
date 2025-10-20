import { create } from 'zustand';
import { NetworkName } from '@massalabs/massa-web3';

interface AppStoreState {
  networkName: NetworkName;
  setNetworkName: (networkName: NetworkName) => void;
}

export const useAppStore = create<AppStoreState>(set => ({
  networkName: NetworkName.Buildnet,

  setNetworkName: (networkName: NetworkName) => {
    set({ networkName });
  },
}));
