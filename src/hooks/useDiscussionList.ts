import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { UserProfile, Discussion, Contact, db } from '../db';
import {
  acceptDiscussionRequest,
  initializeDiscussion,
} from '../crypto/discussionInit';
import { announcementService } from '../services/announcement';

type AppState = 'loading' | 'welcome' | 'setup' | 'main';

export const useDiscussionList = () => {
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
  const [appState, setAppState] = useState<AppState>('loading');
  const [showNewDiscussion, setShowNewDiscussion] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [showContactCard, setShowContactCard] = useState(false);
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
  const [loginError, setLoginError] = useState<string | null>(null);

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
    (userId: string) => contacts.find(contact => contact.userId === userId),
    [contacts]
  );

  const getDiscussionByContactUserId = useCallback(
    (contactUserId: string) =>
      discussions.find(d => d.contactUserId === contactUserId),
    [discussions]
  );

  useEffect(() => {
    const checkExistingAccount = async () => {
      if (hasCheckedExistingRef.current) return;

      hasCheckedExistingRef.current = true;

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

    if (isLoading) return;
    if (!isInitialized) {
      if (appState !== 'setup') setAppState('setup');
      return;
    }
    if (userProfile) {
      if (appState !== 'main') setAppState('main');
      return;
    }
    if (appState === 'loading') {
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

  useEffect(() => {
    loadContacts();
    loadDiscussions();
  }, [loadContacts, loadDiscussions]);

  const handleAccountSelected = useCallback(() => {
    setLoginError(null);
    setAppState('main');
  }, []);

  const handleLoginError = useCallback((error: string | null) => {
    setLoginError(error);
    forceUpdate({});
  }, []);

  const handleCreateNewAccount = useCallback(() => {
    setAppState('setup');
  }, []);

  const handleSetupComplete = useCallback(() => {
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
    setShowContactCard(true);
  }, []);

  const handleBackFromContactCard = useCallback(() => {
    setShowContactCard(false);
    setSelectedContact(null);
  }, []);

  const handleStartDiscussionFromCard = useCallback(() => {
    // Keep selectedContact set; just hide the card so the Discussion view renders
    setShowContactCard(false);
  }, []);

  const handleNewDiscussionCreated = useCallback(() => {
    loadDiscussions();
    loadContacts();
  }, [loadDiscussions, loadContacts]);

  const handleBackFromDiscussion = useCallback(async () => {
    if (selectedContact && userProfile?.userId) {
      try {
        await db.markMessagesAsRead(userProfile.userId, selectedContact.userId);
      } catch (error) {
        console.error('Failed to mark messages as read on back:', error);
      }
    }
    setSelectedContact(null);
    loadDiscussions();
    loadContacts();
  }, [loadDiscussions, loadContacts, selectedContact, userProfile?.userId]);

  const handleSelectDiscussion = useCallback(
    (discussion: Discussion) => {
      const contact = getContactByUserId(discussion.contactUserId);
      if (contact) setSelectedContact(contact);
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
        await loadContacts();
        await loadDiscussions();
      }
    },
    [loadDiscussions, loadContacts]
  );

  const handleAcceptDiscussionRequest = useCallback(
    async (discussion: Discussion, newName?: string) => {
      try {
        if (discussion.id == null) return;
        // If the user provided a new contact name, update it first
        if (newName && userProfile?.userId) {
          try {
            await db.contacts
              .where('[ownerUserId+userId]')
              .equals([userProfile.userId, discussion.contactUserId])
              .modify({ name: newName });
            await loadContacts();
          } catch (e) {
            console.error('Failed to update contact name:', e);
          }
        }
        await acceptDiscussionRequest(discussion);
        await loadDiscussions();
      } catch (error) {
        console.error('Failed to accept discussion:', error);
      }
    },
    [loadDiscussions, loadContacts, userProfile?.userId]
  );

  const handleRefresh = useCallback(async () => {
    try {
      const svc = await announcementService.getInstance();
      const result = await svc.fetchAndProcessAnnouncements();
      if (result.success) {
        console.log('Fetched announcements successfully');
      } else {
        console.error('Failed to fetch announcements:', result.error);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      await loadDiscussions();
      await loadContacts();
    }
  }, [loadDiscussions, loadContacts]);

  const handleRefuseDiscussionRequest = useCallback(
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
      } catch (error) {
        console.error('Failed to refuse discussion:', error);
      }
      await loadDiscussions();
      await loadContacts();
    },
    [loadDiscussions, loadContacts]
  );

  return {
    stores: {
      isLoading,
    },
    state: {
      activeTab,
      appState,
      showNewDiscussion,
      showNewContact,
      showContactCard,
      selectedContact,
      existingAccountInfo,
      discussions,
      lastMessages,
      loginError,
    },
    selectors: {
      getContactByUserId,
      getDiscussionByContactUserId,
    },
    handlers: {
      handleAccountSelected,
      handleLoginError,
      handleCreateNewAccount,
      handleSetupComplete,
      handleBackToWelcome,
      handleTabChange,
      handleOpenNewDiscussion,
      handleCloseNewDiscussion,
      handleSelectRecipient,
      handleBackFromContactCard,
      handleStartDiscussionFromCard,
      handleNewDiscussionCreated,
      handleBackFromDiscussion,
      handleSelectDiscussion,
      handleOpenNewContact,
      handleCancelNewContact,
      handleCreatedNewContact,
      handleAcceptDiscussionRequest,
      handleRefuseDiscussionRequest,
      handleRefresh,
    },
  };
};
