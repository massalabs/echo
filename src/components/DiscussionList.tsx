import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { UserProfile, Discussion, Contact, db } from '../db';
import DiscussionHeader from './DiscussionHeader';
import EmptyDiscussions from './EmptyDiscussions';
import DiscussionListItem from './DiscussionListItem';
import DebugPanel from './DebugPanel';
import Settings from './Settings';
import Wallet from '../pages/Wallet';
import BottomNavigation from './BottomNavigation';
import WelcomeBack from './WelcomeBack';
import AccountCreation from './AccountCreation';
import NewDiscussion from './NewDiscussion';
import NewContact from './NewContact';
import DiscussionView from './Discussion';

import {
  acceptDiscussionRequest,
  initializeDiscussion,
} from '../crypto/discussionInit';

// Global error state (survives component remounts)
let globalLoginError: string | null = null;

const DiscussionList: React.FC = () => {
  const {
    userProfile,
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
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lastMessages, setLastMessages] = useState<
    Map<string, { content: string; timestamp: Date }>
  >(new Map());
  const hasCheckedExistingRef = useRef(false);
  const [, forceUpdate] = useState({});

  const loadDiscussions = useCallback(async () => {
    try {
      if (!userProfile?.userId) {
        setDiscussions([]);
        setLastMessages(new Map());
        return;
      }
      const discussionsList = await db.getDiscussionsByOwner(
        userProfile.userId
      );
      setDiscussions(discussionsList);

      // Extract last message for each discussion directly from discussionsList
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
      setLastMessages(messagesMap);
    } catch (error) {
      console.error('Failed to load discussions:', error);
    }
  }, [userProfile?.userId]);

  const loadContacts = useCallback(async () => {
    try {
      if (!userProfile?.userId) {
        setContacts([]);
        return;
      }
      const contactsList = await db.getContactsByOwner(userProfile.userId);
      setContacts(contactsList);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  }, [userProfile?.userId]);

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

  // Load discussions and contacts when entering main app
  useEffect(() => {
    if (appState === 'main') {
      loadDiscussions();
      loadContacts();
    }
  }, [appState, loadDiscussions, loadContacts]);

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
    // Reload discussions and contacts when a new discussion is created or message is sent
    loadDiscussions();
    loadContacts();
  }, [loadDiscussions, loadContacts]);

  const handleBackFromDiscussion = useCallback(async () => {
    // Mark messages as read for the contact we just viewed
    if (selectedContact && userProfile?.userId) {
      try {
        await db.markMessagesAsRead(userProfile.userId, selectedContact.userId);
      } catch (error) {
        console.error('Failed to mark messages as read on back:', error);
      }
    }

    setSelectedContact(null);

    // Reload discussions and contacts to show updated data (including cleared unread counts)
    loadDiscussions();
    loadContacts();
  }, [loadDiscussions, loadContacts, selectedContact, userProfile?.userId]);

  const handleSelectDiscussion = useCallback(
    (discussion: Discussion) => {
      const contact = getContactByUserId(discussion.contactUserId);
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

  const handleCreatedNewContact = useCallback(
    async (contact: Contact) => {
      setShowNewContact(false);
      try {
        await initializeDiscussion(contact);
      } catch (e) {
        console.error(
          'Failed to initialize discussion after contact creation:',
          e
        );
      } finally {
        // Reload lists so the new discussion/thread shows up
        await loadDiscussions();
        await loadContacts();
      }
    },
    [loadDiscussions, loadContacts]
  );

  const handleAcceptDiscussionRequest = useCallback(
    async (discussion: Discussion) => {
      try {
        if (discussion.id == null) return;

        await acceptDiscussionRequest(discussion);
        await loadDiscussions();
      } catch (error) {
        console.error('Failed to accept discussion:', error);
      }
    },
    [loadDiscussions]
  );

  const handleRefusePendingDiscussion = useCallback(
    async (discussion: Discussion) => {
      try {
        const confirmed = window.confirm(
          'Refuse connection request? This will close the discussion.'
        );
        if (!confirmed) return;
        if (discussion.id == null) return;
        await db.discussions.update(discussion.id, {
          status: 'closed',
          unreadCount: 0,
          updatedAt: new Date(),
        });
        await loadDiscussions();
      } catch (error) {
        console.error('Failed to refuse discussion:', error);
      }
    },
    [loadDiscussions]
  );

  // Show loading state
  if (appState === 'loading' || isLoading) {
    return (
      <div className="min-h-screen-mobile bg-white dark:bg-gray-900 flex items-center justify-center">
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
      <DiscussionView
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
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto h-screen-mobile flex flex-col">
        {/* Header */}
        <DiscussionHeader />

        {/* Main content area */}
        <div className="px-4 pb-20 flex-1 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-medium text-black dark:text-white">
                Discussions
              </h2>
              <button
                onClick={loadDiscussions}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
              >
                Refresh
              </button>
            </div>

            {/* Discussions list */}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {discussions.length === 0 ? (
                <EmptyDiscussions />
              ) : (
                discussions.map(discussion => {
                  const contact = getContactByUserId(discussion.contactUserId);
                  if (!contact) return null;

                  const lastMessage = lastMessages.get(
                    discussion.contactUserId
                  );
                  const isPendingIncoming =
                    discussion.status === 'pending' &&
                    discussion.direction === 'received';
                  const isPendingOutgoing =
                    discussion.status === 'pending' &&
                    discussion.direction === 'initiated';

                  return (
                    <DiscussionListItem
                      key={discussion.id}
                      discussion={discussion}
                      contact={contact}
                      lastMessage={lastMessage}
                      isPendingIncoming={isPendingIncoming}
                      isPendingOutgoing={isPendingOutgoing}
                      onSelect={handleSelectDiscussion}
                      onAccept={handleAcceptDiscussionRequest}
                      onRefuse={handleRefusePendingDiscussion}
                    />
                  );
                })
              )}
            </div>

            {/* Debug info - hidden in production */}
            <DebugPanel />
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
