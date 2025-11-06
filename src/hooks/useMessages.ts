import { useState, useCallback, useEffect } from 'react';
import { Contact, Message, db } from '../db';
import { useAccountStore } from '../stores/accountStore';
import { messageService } from '../services/message';
import { notificationService } from '../services/notifications';

interface UseMessagesProps {
  contact?: Contact;
  discussionId?: number;
}

export const useMessages = ({
  contact,
  discussionId,
}: UseMessagesProps = {}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { userProfile } = useAccountStore();

  const loadMessages = useCallback(async () => {
    if (!contact?.userId) return;

    try {
      setIsLoading(true);
      console.log('Loading messages for contact:', contact.userId);
      if (!userProfile?.userId) return;
      const messageList = await db.getMessagesForContactByOwner(
        userProfile.userId,
        contact.userId
      );
      console.log(
        'Loaded messages:',
        messageList.length,
        'for contact:',
        contact.userId
      );
      // Reverse to show oldest messages first (chronological order)
      setMessages(messageList.reverse());
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [contact?.userId, userProfile?.userId]);

  const syncMessages = useCallback(async () => {
    if (!discussionId || isSyncing) return;
    if (!contact?.name) return;

    try {
      setIsSyncing(true);

      // Fetch new encrypted messages
      const fetchResult = await messageService.fetchMessages();

      if (fetchResult.success && fetchResult.newMessagesCount > 0) {
        // Reload messages to show the new ones (decryption handled elsewhere)
        await loadMessages();

        // Show notification if app is in background
        if (document.hidden) {
          await notificationService.showDiscussionNotification(
            contact.name,
            'New message received'
          );
        }
      }
    } catch (error) {
      console.error('Failed to sync messages:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [discussionId, isSyncing, contact?.name, loadMessages]);

  // Global sync that does not depend on a specific discussion
  const syncAllMessages = useCallback(async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      const fetchResult = await messageService.fetchMessages();
      if (fetchResult.success && fetchResult.newMessagesCount > 0) {
        // No specific thread to reload here; consumers can reload their views
        // Optionally, we could emit a custom event here if needed
      }
    } catch (error) {
      console.error('Failed to globally sync messages:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content || !userProfile?.userId || isSending) return;
      if (!contact?.userId) return;

      setIsSending(true);

      const ownerUserId = useAccountStore.getState().userProfile?.userId;
      if (!ownerUserId)
        return { success: false, error: 'No authenticated user' };

      const discussion = await db.getDiscussionByOwnerAndContact(
        ownerUserId,
        contact.userId
      );

      if (!discussion) return { success: false, error: 'Discussion not found' };

      // Create message with sending status
      const message: Omit<Message, 'id'> = {
        ownerUserId,
        contactUserId: contact.userId,
        content,
        type: 'text',
        direction: 'outgoing',
        status: 'sending',
        timestamp: new Date(),
        encrypted: true,
      };

      // Persist to DB, keep the generated id for later status updates
      const messageId = await db.addMessage(message);
      const messageWithId = { ...message, id: messageId };
      setMessages(prev => [...prev, messageWithId]);

      try {
        const result = await messageService.sendMessage(messageWithId);

        // Reflect final status in local state (always update if message is provided)
        if (result.message) {
          setMessages(prev =>
            prev.map(m =>
              m.id === messageId ? { ...m, status: result.message!.status } : m
            )
          );
        } else if (!result.success) {
          // If no message in result but it failed, mark as failed in local state
          setMessages(prev =>
            prev.map(m => (m.id === messageId ? { ...m, status: 'failed' } : m))
          );
        }

        if (!result.success) {
          console.error('Failed to send message:', result.error);
          throw new Error(result.error);
        }
      } catch (error) {
        // Ensure message is marked as failed in local state on any error
        setMessages(prev =>
          prev.map(m => (m.id === messageId ? { ...m, status: 'failed' } : m))
        );
        throw error;
      } finally {
        setIsSending(false);
      }
    },
    [contact?.userId, userProfile, isSending]
  );

  const resendMessage = useCallback(
    async (message: Message) => {
      if (!message.id || isSending) return;
      if (!contact?.userId) return;

      setIsSending(true);

      try {
        // Optimistically reflect sending in UI; service persists DB status
        setMessages(prev =>
          prev.map(m => (m.id === message.id ? { ...m, status: 'sending' } : m))
        );

        const result = await messageService.sendMessage(message);
        if (!contact?.userId) return;

        // Reflect final status in local state (always update if message is provided)
        if (result.message) {
          setMessages(prev =>
            prev.map(m =>
              m.id === message.id ? { ...m, status: result.message!.status } : m
            )
          );
        } else if (!result.success) {
          // If no message in result but it failed, mark as failed in local state
          setMessages(prev =>
            prev.map(m =>
              m.id === message.id ? { ...m, status: 'failed' } : m
            )
          );
        }

        if (!result.success) {
          console.error('Failed to resend message:', result.error);
          throw new Error(result.error);
        }
      } catch (error) {
        // Ensure message is marked as failed in local state on any error
        setMessages(prev =>
          prev.map(m => (m.id === message.id ? { ...m, status: 'failed' } : m))
        );
        throw error;
      } finally {
        setIsSending(false);
      }
    },
    [contact?.userId, isSending]
  );

  // Set up periodic message sync when discussion is active (reduced frequency)
  useEffect(() => {
    if (!discussionId) return;

    console.log(
      'Setting up periodic sync for discussion',
      discussionId,
      'every 2 minutes'
    );

    // Initial sync
    syncMessages();

    // Set up periodic sync every 2 minutes (reduced from 30 seconds)
    const syncInterval = setInterval(
      () => {
        console.log('Periodic sync triggered for discussion', discussionId);
        syncMessages();
      },
      2 * 60 * 1000
    ); // 2 minutes

    return () => {
      console.log('Clearing periodic sync for discussion', discussionId);
      clearInterval(syncInterval);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [discussionId]); // Removed syncMessages from dependencies to prevent infinite loop

  // Listen for visibility changes to sync when app becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && discussionId) {
        syncMessages();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [discussionId]); // Removed syncMessages from dependencies to prevent infinite loop

  return {
    messages,
    isLoading,
    isSending,
    isSyncing,
    loadMessages,
    sendMessage,
    resendMessage,
    syncMessages,
    syncAllMessages,
  };
};
