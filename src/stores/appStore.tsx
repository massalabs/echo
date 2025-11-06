import { create } from 'zustand';
import { NetworkName } from '@massalabs/massa-web3';
import { Contact, UserProfile } from '../db';
import { createSelectors } from './utils/createSelectors';

type AppState = 'loading' | 'welcome' | 'setup' | 'main';
type ActiveTab = 'wallet' | 'discussions' | 'settings';

interface AppStoreState {
  // Network config
  networkName: NetworkName;
  setNetworkName: (networkName: NetworkName) => void;

  // UI/Navigation state
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  appState: AppState;
  setAppState: (state: AppState) => void;

  // Modal visibility
  showNewDiscussion: boolean;
  showNewContact: boolean;
  showContactCard: boolean;
  setShowNewDiscussion: (show: boolean) => void;
  setShowNewContact: (show: boolean) => void;
  setShowContactCard: (show: boolean) => void;

  // Selection state
  selectedContact: Contact | null;
  setSelectedContact: (contact: Contact | null) => void;

  // Account info (for welcome screen)
  existingAccountInfo: UserProfile | null;
  setExistingAccountInfo: (info: UserProfile | null) => void;

  // Error state
  loginError: string | null;
  setLoginError: (error: string | null) => void;
}

const useAppStoreBase = create<AppStoreState>(set => ({
  // Network config
  networkName: NetworkName.Buildnet,
  setNetworkName: (networkName: NetworkName) => {
    set({ networkName });
  },

  // UI/Navigation state
  activeTab: 'discussions',
  setActiveTab: (tab: ActiveTab) => {
    set({ activeTab: tab });
  },

  appState: 'loading',
  setAppState: (state: AppState) => {
    set({ appState: state });
  },

  // Modal visibility
  showNewDiscussion: false,
  showNewContact: false,
  showContactCard: false,
  setShowNewDiscussion: (show: boolean) => {
    set({ showNewDiscussion: show });
  },
  setShowNewContact: (show: boolean) => {
    set({ showNewContact: show });
  },
  setShowContactCard: (show: boolean) => {
    set({ showContactCard: show });
  },

  // Selection state
  selectedContact: null,
  setSelectedContact: (contact: Contact | null) => {
    set({ selectedContact: contact });
  },

  // Account info
  existingAccountInfo: null,
  setExistingAccountInfo: (info: UserProfile | null) => {
    set({ existingAccountInfo: info });
  },

  // Error state
  loginError: null,
  setLoginError: (error: string | null) => {
    set({ loginError: error });
  },
}));

export const useAppStore = createSelectors(useAppStoreBase);
