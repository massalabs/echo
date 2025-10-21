import { useState, useCallback } from 'react';
import { Contact, Message, db } from '../db';

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
        const message: Omit<Message, 'id'> = {
          contactUserId: contact.userId,
          content: content.trim(),
          type: 'text',
          direction: 'outgoing',
          status: 'sending',
          timestamp: new Date(),
          encrypted: discussionId ? true : false, // Encrypt if we have a discussion
        };

        const messageId = await db.addMessage(message);

        // Update local state
        const newMsg = { ...message, id: messageId } as Message;
        setMessages(prev => [...prev, newMsg]);

        // Notify parent that a message was sent (this will trigger conversation list refresh)
        if (onMessageSent) {
          console.log('Calling onMessageSent callback');
          onMessageSent();
        } else {
          console.log('No onMessageSent callback provided');
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

  return {
    messages,
    isLoading,
    isSending,
    loadMessages,
    sendMessage,
  };
};
