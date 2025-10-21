import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { formatMassaAddress } from '../utils/addressUtils';
import { UserProfile, DiscussionThread, Contact } from '../db';
import { db } from '../db';
import { formatRelativeTime } from '../utils/timeUtils';
import appLogo from '../assets/echo_face.svg';
import Settings from './Settings';
import Wallet from './wallet/Wallet';
import BottomNavigation from './BottomNavigation';
import WelcomeBack from './WelcomeBack';
import AccountCreation from './AccountCreation';
import NewDiscussion from './NewDiscussion';
import NewContact from './NewContact';
import Discussion from './Discussion';
import ContactAvatar from './avatar/ContactAvatar';
import { messageReceptionService } from '../services/messageReception';

// Global error state (survives component remounts)
let globalLoginError: string | null = null;

const DiscussionList: React.FC = () => {
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
  const [showNewDiscussion, setShowNewDiscussion] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [existingAccountInfo, setExistingAccountInfo] =
    useState<UserProfile | null>(null);
  const [discussionThreads, setDiscussionThreads] = useState<
    DiscussionThread[]
  >([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const hasCheckedExistingRef = useRef(false);
  const [, forceUpdate] = useState({});

  const loadDiscussionThreads = useCallback(async () => {
    try {
      const discussionThreadsList = await db.getDiscussionThreads();
      setDiscussionThreads(discussionThreadsList);
    } catch (error) {
      console.error('Failed to load discussion threads:', error);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const contactsList = await db.contacts.toArray();
      setContacts(contactsList);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  }, []);

  const getContactByUserId = useCallback(
    (userId: string) => {
      return contacts.find(contact => contact.userId === userId);
    },
    [contacts]
  );

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

  // Load discussion threads and contacts when entering main app
  useEffect(() => {
    if (appState === 'main') {
      loadDiscussionThreads();
      loadContacts();
    }
  }, [appState, loadDiscussionThreads, loadContacts]);

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

      // Clear IndexedDB (Dexie database) - multiple approaches to ensure it's wiped
      // Close the database first
      db.close();

      // Delete the database
      await db.delete();

      // Also try to clear any cached database instances
      try {
        await db.delete();
      } catch (_e) {
        // Ignore errors here as the database might already be deleted
      }

      // Clear any other IndexedDB databases that might exist
      try {
        const databases = await indexedDB.databases();
        for (const database of databases) {
          if (database.name?.includes('EchoDatabase')) {
            indexedDB.deleteDatabase(database.name);
          }
        }
      } catch (_e) {
        // Some browsers don't support indexedDB.databases()
        console.log('Could not enumerate databases');
      }

      // Reset the account store
      await resetAccount();

      // Force page reload to ensure clean state
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset all accounts:', error);
      // Even if there's an error, try to reload to reset state
      window.location.reload();
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

  const handleBackToWelcome = useCallback(() => {
    setAppState('welcome');
  }, []);

  const handleSimulateIncomingDiscussion = useCallback(async () => {
    try {
      console.log('Simulating incoming discussion announcement...');

      // Request notification permission first
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        console.log('Notification permission:', permission);
      }

      // Get the message reception service
      const service = await messageReceptionService.getInstance();

      // Use the dedicated simulation method
      const result = await service.simulateIncomingDiscussion();

      if (result.success && result.newMessagesCount > 0) {
        console.log('Successfully simulated incoming discussion!');
        // Reload discussion threads and contacts to show the new discussion
        await loadDiscussionThreads();
        await loadContacts();
      } else {
        console.log(
          'No new discussions created from simulation:',
          result.error
        );
      }
    } catch (error) {
      console.error('Failed to simulate incoming discussion:', error);
    }
  }, [loadDiscussionThreads, loadContacts]);

  const handleTabChange = useCallback(
    (tab: 'wallet' | 'discussions' | 'settings') => {
      setActiveTab(tab);
    },
    []
  );

  const handleOpenNewDiscussion = useCallback(() => {
    setShowNewDiscussion(true);
  }, []);

  const handleCloseNewDiscussion = useCallback(() => {
    setShowNewDiscussion(false);
  }, []);

  const handleSelectRecipient = useCallback((contact: Contact) => {
    setSelectedContact(contact);
    setShowNewDiscussion(false);
  }, []);

  const handleNewDiscussionCreated = useCallback(() => {
    // Reload discussion threads and contacts when a new discussion is created or message is sent
    loadDiscussionThreads();
    loadContacts();
  }, [loadDiscussionThreads, loadContacts]);

  const handleBackFromDiscussion = useCallback(() => {
    setSelectedContact(null);
    // Reload discussion threads and contacts to show updated data
    loadDiscussionThreads();
    loadContacts();
  }, [loadDiscussionThreads, loadContacts]);

  const handleSelectDiscussionThread = useCallback(
    (discussionThread: DiscussionThread) => {
      const contact = getContactByUserId(discussionThread.contactUserId);
      if (contact) {
        setSelectedContact(contact);
      }
    },
    [getContactByUserId]
  );

  const handleOpenNewContact = useCallback(() => {
    setShowNewContact(true);
  }, []);

  const handleCancelNewContact = useCallback(() => {
    setShowNewContact(false);
  }, []);

  const handleCreatedNewContact = useCallback((_contact: Contact) => {
    setShowNewContact(false);
    // After creating, return to selector; optionally auto-select the new contact
  }, []);

  // Show loading state
  if (appState === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
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
    return (
      <AccountCreation
        onComplete={handleSetupComplete}
        onBack={handleBackToWelcome}
      />
    );
  }

  // Show new discussion screen
  if (selectedContact) {
    return (
      <Discussion
        contact={selectedContact}
        onBack={handleBackFromDiscussion}
        onDiscussionCreated={handleNewDiscussionCreated}
      />
    );
  }

  if (showNewContact) {
    return (
      <NewContact
        onCancel={handleCancelNewContact}
        onCreated={handleCreatedNewContact}
      />
    );
  }

  if (showNewDiscussion) {
    return (
      <NewDiscussion
        onClose={handleCloseNewDiscussion}
        onSelectRecipient={handleSelectRecipient}
        onNewContact={handleOpenNewContact}
      />
    );
  }

  // Show main app
  if (activeTab === 'settings') {
    return <Settings onTabChange={handleTabChange} />;
  }

  if (activeTab === 'wallet') {
    return <Wallet onTabChange={handleTabChange} />;
  }

  return (
    <div className="min-h-screen bg-[#efefef] dark:bg-gray-900">
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
              <h1 className="text-xl font-semibold text-black dark:text-white">
                Echo
              </h1>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="px-4 pb-20">
          <div className="bg-white dark:bg-gray-800 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-medium text-black dark:text-white">
                Discussions
              </h2>
              <button
                onClick={loadDiscussionThreads}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
              >
                Refresh
              </button>
            </div>

            {/* Discussion threads list */}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {discussionThreads.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-gray-400 dark:text-gray-500"
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
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    No discussions yet
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Start a discussion by tapping the compose button
                  </p>
                </div>
              ) : (
                discussionThreads.map(discussionThread => {
                  const contact = getContactByUserId(
                    discussionThread.contactUserId
                  );
                  if (!contact) return null;

                  return (
                    <button
                      key={discussionThread.id}
                      onClick={() =>
                        handleSelectDiscussionThread(discussionThread)
                      }
                      className="w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <ContactAvatar contact={contact} size={12} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {contact.name}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatRelativeTime(
                                discussionThread.lastMessageTimestamp
                              )}
                            </p>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {discussionThread.lastMessageContent}
                            </p>
                            {discussionThread.unreadCount > 0 && (
                              <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                                {discussionThread.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Debug info - hidden in production */}
            <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-left">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                User: {userProfile?.username}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Address:{' '}
                {userProfile?.wallet?.address
                  ? formatMassaAddress(userProfile.wallet.address)
                  : 'N/A'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Status: {userProfile?.status}
              </p>
              <button
                onClick={handleResetAccount}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
              >
                Reset Account (for testing)
              </button>
              <br />
              <button
                onClick={handleResetAllAccounts}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
              >
                Reset All Accounts (wipe local storage)
              </button>
              <br />
              <button
                onClick={handleSimulateIncomingDiscussion}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
              >
                Simulate Incoming Discussion (test)
              </button>
            </div>
          </div>
        </div>

        {/* Floating Action Button */}
        <button
          onClick={handleOpenNewDiscussion}
          className="fixed bottom-24 right-4 w-14 h-14 bg-purple-600 dark:bg-purple-700 rounded-full flex items-center justify-center shadow-lg hover:bg-purple-700 dark:hover:bg-purple-800 transition-colors"
        >
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

export default DiscussionList;
