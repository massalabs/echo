import { useState, useCallback, useEffect } from 'react';
import { Contact, Discussion, db } from '../db';
import {
  initializeDiscussion,
  getDiscussionsForContact,
} from '../crypto/discussionInit';

interface UseDiscussionProps {
  contact: Contact;
}

export const useDiscussion = ({ contact }: UseDiscussionProps) => {
  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadDiscussion = useCallback(async () => {
    if (!contact.userId) return;

    try {
      setIsLoading(true);
      const discussions = await getDiscussionsForContact(
        contact.ownerUserId,
        contact.userId
      );

      // Get the most recent discussion (active or pending)
      const latestDiscussion = discussions
        .filter(d => d.status === 'active' || d.status === 'pending')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      setDiscussion(latestDiscussion || null);
    } catch (error) {
      console.error('Failed to load discussion:', error);
    } finally {
      setIsLoading(false);
    }
  }, [contact.ownerUserId, contact.userId]);

  const initializeNewDiscussion = useCallback(async (): Promise<boolean> => {
    if (!contact.userId || isInitializing) return false;

    try {
      setIsInitializing(true);

      // Guard: we cannot initialize a discussion without the contact's public keys
      if (!contact.publicKeys || contact.publicKeys.length === 0) {
        throw new Error(
          'Contact is missing public keys. Cannot start a discussion yet.'
        );
      }

      // Initialize discussion using Contact object (matches current API)
      const result = await initializeDiscussion(contact);

      // Reload discussions to get the new one
      await loadDiscussion();

      console.log('Discussion initialized:', result.discussionId);
      return true;
    } catch (error) {
      console.error('Failed to initialize discussion:', error);
      return false;
    } finally {
      setIsInitializing(false);
    }
  }, [contact, isInitializing, loadDiscussion]);

  const ensureDiscussionExists = useCallback(async (): Promise<boolean> => {
    if (discussion) return true;

    // Check if a discussion already exists for this contact
    const existingDiscussion = await db.discussions
      .where('[ownerUserId+contactUserId]')
      .equals([contact.ownerUserId, contact.userId])
      .first();

    if (existingDiscussion) {
      console.log('Discussion already exists for contact:', contact.userId);
      return true;
    }

    // If no discussion exists, initialize one
    return await initializeNewDiscussion();
  }, [
    discussion,
    contact.ownerUserId,
    contact.userId,
    initializeNewDiscussion,
  ]);

  useEffect(() => {
    loadDiscussion();
  }, [loadDiscussion]);

  return {
    discussion,
    isInitializing,
    isLoading,
    loadDiscussion,
    initializeNewDiscussion,
    ensureDiscussionExists,
  };
};
