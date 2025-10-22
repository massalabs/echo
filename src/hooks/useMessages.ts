import { useState, useCallback, useEffect } from 'react';
import { Contact, Message, db } from '../db';
import { messageReceptionService } from '../services/messageReception';
import { notificationService } from '../services/notifications';

interface UseMessagesProps {
  contact: Contact;
  discussionId?: number;
  onDiscussionRequired?: () => Promise<boolean>;
  onMessageSent?: () => void;
}

export const useMessages = ({
  contact,
  discussionId,
  onDiscussionRequired,
  onMessageSent,
}: UseMessagesProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadMessages = useCallback(async () => {
    if (!contact.userId) return;

    try {
      setIsLoading(true);
      const messageList = await db.getMessagesForContact(contact.userId);
      // Reverse to show oldest messages first (chronological order)
      setMessages(messageList.reverse());
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [contact.userId]);

  const syncMessages = useCallback(async () => {
    if (!discussionId || isSyncing) return;

    try {
      setIsSyncing(true);

      // Fetch new encrypted messages
      const service = await messageReceptionService.getInstance();
      const fetchResult = await service.fetchNewMessages(discussionId);

      if (fetchResult.success && fetchResult.newMessagesCount > 0) {
        // Decrypt the new messages
        const decryptResult = await service.decryptMessages(discussionId);

        if (decryptResult.success && decryptResult.newMessagesCount > 0) {
          // Reload messages to show the new ones
          await loadMessages();

          // Show notification if app is in background
          if (document.hidden) {
            await notificationService.showDiscussionNotification(
              contact.name,
              'New message received'
            );
          }
        }
      }
    } catch (error) {
      console.error('Failed to sync messages:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [discussionId, isSyncing, contact.name, loadMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !contact.userId || isSending) return;

      // Check if we need to initialize a discussion
      if (!discussionId && onDiscussionRequired) {
        const discussionInitialized = await onDiscussionRequired();
        if (!discussionInitialized) {
          console.error('Failed to initialize discussion');
          return false;
        }
      }

      setIsSending(true);
      try {
        // Create message record with sending status
        const message: Omit<Message, 'id'> = {
          contactUserId: contact.userId,
          content: content.trim(),
          type: 'text',
          direction: 'outgoing',
          status: 'sending',
          timestamp: new Date(),
          encrypted: discussionId ? true : false,
        };

        const messageId = await db.addMessage(message);

        // Update local state immediately
        const newMsg = { ...message, id: messageId } as Message;
        setMessages(prev => [...prev, newMsg]);

        // If we have a discussion, send through protocol API
        if (discussionId) {
          try {
            const service = await messageReceptionService.getInstance();
            const sessionModule = await service.getSessionModule();

            // Get the discussion to access the session
            const discussion = await db.discussions.get(discussionId);
            if (!discussion) {
              throw new Error('Discussion not found');
            }

            // Get the session to access the discussion key
            console.log(
              'Looking for session with ID:',
              discussionId.toString()
            );
            let session = await sessionModule.getSession(
              discussionId.toString()
            );
            if (!session) {
              console.error(
                'Session not found for discussion ID:',
                discussionId
              );
              // Try to create the session if it doesn't exist
              console.log(
                'Attempting to create session for discussion ID:',
                discussionId
              );
              await sessionModule.createSession(discussionId.toString());
              session = await sessionModule.getSession(discussionId.toString());
              if (!session) {
                throw new Error('Failed to create session');
              }
              console.log('Session created successfully');
            } else {
              console.log('Session found:', session.id);
            }

            // Create encrypted message using session module
            const encryptedMessage = await sessionModule.createMessage(
              discussionId.toString(),
              content.trim()
            );

            // Send through protocol API
            const messageProtocol = await service.getMessageProtocol();
            await messageProtocol.sendMessage(session.discussionKey, {
              id: encryptedMessage.id,
              ciphertext: encryptedMessage.ciphertext,
              ct: encryptedMessage.ct,
              rand: encryptedMessage.rand,
              nonce: encryptedMessage.nonce,
              messageType: 'regular',
              direction: 'outgoing',
              timestamp: new Date(),
            });

            // Update message status to sent
            await db.messages.update(messageId, { status: 'sent' });
            setMessages(prev =>
              prev.map(msg =>
                msg.id === messageId ? { ...msg, status: 'sent' } : msg
              )
            );

            console.log('Message sent successfully through protocol API');
          } catch (protocolError) {
            console.error(
              'Failed to send message through protocol:',
              protocolError
            );

            // Update message status to failed
            await db.messages.update(messageId, { status: 'failed' });
            setMessages(prev =>
              prev.map(msg =>
                msg.id === messageId ? { ...msg, status: 'failed' } : msg
              )
            );

            return false;
          }
        } else {
          // No discussion - just mark as sent locally
          await db.messages.update(messageId, { status: 'sent' });
          setMessages(prev =>
            prev.map(msg =>
              msg.id === messageId ? { ...msg, status: 'sent' } : msg
            )
          );
        }

        // Notify parent that a message was sent
        if (onMessageSent) {
          console.log('Calling onMessageSent callback');
          onMessageSent();
        }

        return true; // Success
      } catch (error) {
        console.error('Failed to send message:', error);
        return false; // Failure
      } finally {
        setIsSending(false);
      }
    },
    [
      contact.userId,
      isSending,
      discussionId,
      onDiscussionRequired,
      onMessageSent,
    ]
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
    syncMessages,
  };
};
