import { useCallback, useEffect } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { useDiscussionStore } from '../stores/discussionStore';
import { Discussion, Contact, db } from '../db';
import {
  acceptDiscussionRequest,
  initializeDiscussion,
} from '../crypto/discussionInit';

export const useDiscussionList = () => {
  const { userProfile } = useAccountStore();

  const loadDiscussions = useDiscussionStore(s => s.loadDiscussions);
  const loadContacts = useDiscussionStore(s => s.loadContacts);

  useEffect(() => {
    if (userProfile?.userId) {
      loadContacts(userProfile.userId);
      loadDiscussions(userProfile.userId);
    }
  }, [userProfile?.userId, loadContacts, loadDiscussions]);

  const handleCreatedNewContact = useCallback(
    async (contact: Contact): Promise<void> => {
      try {
        await initializeDiscussion(contact);
      } catch (e) {
        console.error(
          'Failed to initialize discussion after contact creation:',
          e
        );
      } finally {
        if (userProfile?.userId) {
          await loadContacts(userProfile.userId);
          await loadDiscussions(userProfile.userId);
        }
      }
    },
    [loadDiscussions, loadContacts, userProfile?.userId]
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
            await loadContacts(userProfile.userId);
          } catch (e) {
            console.error('Failed to update contact name:', e);
          }
        }
        await acceptDiscussionRequest(discussion);
        if (userProfile?.userId) {
          await loadDiscussions(userProfile.userId);
        }
      } catch (error) {
        console.error('Failed to accept discussion:', error);
      }
    },
    [loadDiscussions, loadContacts, userProfile?.userId]
  );

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
      if (userProfile?.userId) {
        await loadDiscussions(userProfile.userId);
        await loadContacts(userProfile.userId);
      }
    },
    [loadDiscussions, loadContacts, userProfile?.userId]
  );

  // Only return handlers that are actually used - state and selectors should be accessed directly from stores
  return {
    handleCreatedNewContact,
    handleAcceptDiscussionRequest,
    handleRefuseDiscussionRequest,
  };
};
