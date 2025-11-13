import { useCallback } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { Discussion, Contact, db } from '../db';
import {
  acceptDiscussionRequest,
  ensureDiscussionExists,
} from '../crypto/discussionInit';

export const useDiscussionList = () => {
  const { userProfile } = useAccountStore();

  const handleCreatedNewContact = useCallback(
    async (contact: Contact): Promise<void> => {
      try {
        await ensureDiscussionExists(contact);
      } catch (e) {
        console.error(
          'Failed to ensure discussion exists after contact creation:',
          e
        );
      }
    },
    []
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
          } catch (e) {
            console.error('Failed to update contact name:', e);
          }
        }
        await acceptDiscussionRequest(discussion);
      } catch (error) {
        console.error('Failed to accept discussion:', error);
      }
    },
    [userProfile?.userId]
  );

  const handleRefuseDiscussionRequest = useCallback(
    async (discussion: Discussion) => {
      try {
        if (discussion.id == null) return;
        await db.discussions.update(discussion.id, {
          status: 'closed',
          unreadCount: 0,
          updatedAt: new Date(),
        });
      } catch (error) {
        console.error('Failed to refuse discussion:', error);
      }
    },
    []
  );

  // Only return handlers that are actually used - state and selectors should be accessed directly from stores
  return {
    handleCreatedNewContact,
    handleAcceptDiscussionRequest,
    handleRefuseDiscussionRequest,
  };
};
