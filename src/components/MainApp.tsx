import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { formatMassaAddress } from '../utils/addressUtils';
import { UserProfile } from '../db';
import appLogo from '../assets/echo_face.svg';
import Settings from './Settings';
import Wallet from './Wallet';
import BottomNavigation from './BottomNavigation';
import WelcomeBack from './WelcomeBack';
import AccountCreation from './AccountCreation';

// Global error state (survives component remounts)
let globalLoginError: string | null = null;

const MainApp: React.FC = () => {
  const {
    userProfile,
    resetAccount,
    hasExistingAccount,
    getExistingAccountInfo,
    isInitialized,
    isLoading,
  } = useAccountStore();
  const [activeTab, setActiveTab] = useState<
    'wallet' | 'discussions' | 'settings'
  >('discussions');
  const [appState, setAppState] = useState<
    'loading' | 'welcome' | 'setup' | 'main'
  >('loading');
  const [existingAccountInfo, setExistingAccountInfo] =
    useState<UserProfile | null>(null);
  const hasCheckedExistingRef = useRef(false);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const checkExistingAccount = async () => {
      if (hasCheckedExistingRef.current) {
        return; // Prevent multiple checks
      }

      hasCheckedExistingRef.current = true; // Mark as checking immediately

      try {
        const hasAccount = await hasExistingAccount();

        if (hasAccount) {
          const accountInfo = await getExistingAccountInfo();
          setExistingAccountInfo(accountInfo);
          setAppState('welcome');
        } else {
          setAppState('setup');
        }
      } catch (error) {
        console.error('Error checking for existing account:', error);
        setAppState('setup');
      }
    };

    // If we're loading, stay in loading state
    if (isLoading) {
      return;
    }

    // If not initialized, show setup
    if (!isInitialized) {
      if (appState !== 'setup') {
        setAppState('setup');
      }
      return;
    }

    // If initialized and we have a user profile, show main app
    if (isInitialized && userProfile) {
      if (appState !== 'main') {
        setAppState('main');
      }
      return;
    }

    // If initialized but no user profile, check for existing account
    // Only check if we're still in loading state (haven't checked yet)
    if (isInitialized && !userProfile && appState === 'loading') {
      checkExistingAccount();
    }
  }, [
    isLoading,
    isInitialized,
    userProfile,
    hasExistingAccount,
    getExistingAccountInfo,
    appState,
  ]);

  const handleResetAccount = useCallback(async () => {
    try {
      await resetAccount();
      setAppState('setup');
    } catch (error) {
      console.error('Failed to reset account:', error);
    }
  }, [resetAccount]);

  const handleResetAllAccounts = useCallback(async () => {
    try {
      // Clear all local storage
      localStorage.clear();
      sessionStorage.clear();

      // Clear IndexedDB (Dexie database)
      const { db } = await import('../db');
      await db.delete();

      // Reset the account store
      await resetAccount();

      // Force page reload to ensure clean state
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset all accounts:', error);
    }
  }, [resetAccount]);

  const handleAccountSelected = useCallback(() => {
    globalLoginError = null; // Clear any login errors
    setAppState('main');
  }, []);

  const handleLoginError = useCallback((error: string | null) => {
    globalLoginError = error; // Update global variable
    forceUpdate({}); // Force re-render to pick up new error
  }, []);

  const handleCreateNewAccount = useCallback(() => {
    setAppState('setup');
  }, []);

  const handleSetupComplete = useCallback(() => {
    // Force transition to main - the useEffect should handle this, but this is a fallback
    setAppState('main');
  }, []);

  const handleTabChange = useCallback(
    (tab: 'wallet' | 'discussions' | 'settings') => {
      setActiveTab(tab);
    },
    []
  );

  // Show loading state
  if (appState === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show welcome back screen for existing accounts
  if (appState === 'welcome') {
    return (
      <WelcomeBack
        key="welcomeback-stable"
        onCreateNewAccount={handleCreateNewAccount}
        onAccountSelected={handleAccountSelected}
        accountInfo={existingAccountInfo}
        persistentError={globalLoginError}
        onErrorChange={handleLoginError}
      />
    );
  }

  // Show account setup for new users
  if (appState === 'setup') {
    return <AccountCreation onComplete={handleSetupComplete} />;
  }

  // Show main app
  if (activeTab === 'settings') {
    return <Settings onTabChange={handleTabChange} />;
  }

  if (activeTab === 'wallet') {
    return <Wallet onTabChange={handleTabChange} />;
  }

  return (
    <div className="min-h-screen bg-[#efefef]">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={appLogo}
                className="w-9 h-9 rounded object-cover"
                alt="Echo logo"
              />
              <h1 className="text-xl font-semibold text-black">Echo</h1>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="px-4 pb-20">
          <div className="bg-white rounded-lg p-6 text-center">
            <h2 className="text-lg font-medium text-black mb-2">
              Conversations list
            </h2>

            {/* Placeholder content */}
            <div className="py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <p className="text-sm text-gray-500 mb-4">No conversations yet</p>
              <p className="text-xs text-gray-400">
                Start a conversation by tapping the compose button
              </p>
            </div>

            {/* Debug info - hidden in production */}
            <div className="mt-8 p-4 bg-gray-50 rounded-lg text-left">
              <p className="text-xs text-gray-500 mb-1">
                User: {userProfile?.username}
              </p>
              <p className="text-xs text-gray-500 mb-1">
                Address:{' '}
                {userProfile?.wallet?.address
                  ? formatMassaAddress(userProfile.wallet.address)
                  : 'N/A'}
              </p>
              <p className="text-xs text-gray-500 mb-2">
                Status: {userProfile?.status}
              </p>
              <button
                onClick={handleResetAccount}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                Reset Account (for testing)
              </button>
              <br />
              <button
                onClick={handleResetAllAccounts}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                Reset All Accounts (wipe local storage)
              </button>
            </div>
          </div>
        </div>

        {/* Floating Action Button */}
        <button className="fixed bottom-24 right-4 w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center shadow-lg hover:bg-purple-700 transition-colors">
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>

        {/* Bottom Navigation */}
        <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </div>
  );
};

export default MainApp;
