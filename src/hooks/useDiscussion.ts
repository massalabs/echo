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
      const discussions = await getDiscussionsForContact(contact.userId);

      // Get the most recent active discussion
      const activeDiscussion = discussions
        .filter(d => d.status === 'active')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      setDiscussion(activeDiscussion || null);
    } catch (error) {
      console.error('Failed to load discussion:', error);
    } finally {
      setIsLoading(false);
    }
  }, [contact.userId]);

  const initializeNewDiscussion = useCallback(async (): Promise<boolean> => {
    if (!contact.userId || isInitializing) return false;

    try {
      setIsInitializing(true);

      // Use the contact's user ID for discussion initialization
      const result = await initializeDiscussion(contact.userId);

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
  }, [contact.userId, isInitializing, loadDiscussion]);

  const ensureDiscussionExists = useCallback(async (): Promise<boolean> => {
    if (discussion) return true;

    // Check if a discussion already exists for this contact
    const existingDiscussion = await db.discussions
      .where('contactUserId')
      .equals(contact.userId)
      .first();

    if (existingDiscussion) {
      console.log('Discussion already exists for contact:', contact.userId);
      return true;
    }

    // If no discussion exists, initialize one
    return await initializeNewDiscussion();
  }, [discussion, contact.userId, initializeNewDiscussion]);

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
