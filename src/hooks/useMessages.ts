import { useState, useCallback } from 'react';
import { Contact, Message, db } from '../db';

interface UseMessagesProps {
  contact: Contact;
}

export const useMessages = ({ contact }: UseMessagesProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const loadMessages = useCallback(async () => {
    if (!contact.id) return;

    try {
      setIsLoading(true);
      const messageList = await db.getMessagesForContact(contact.id);
      // Reverse to show oldest messages first (chronological order)
      setMessages(messageList.reverse());
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [contact.id]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !contact.id || isSending) return;

      setIsSending(true);
      try {
        const message: Omit<Message, 'id'> = {
          contactId: contact.id,
          content: content.trim(),
          type: 'text',
          direction: 'outgoing',
          status: 'sending',
          timestamp: new Date(),
          encrypted: false,
        };

        const messageId = await db.addMessage(message);

        // Update local state
        const newMsg = { ...message, id: messageId } as Message;
        setMessages(prev => [...prev, newMsg]);

        return true; // Success
      } catch (error) {
        console.error('Failed to send message:', error);
        return false; // Failure
      } finally {
        setIsSending(false);
      }
    },
    [contact.id, isSending]
  );

  return {
    messages,
    isLoading,
    isSending,
    loadMessages,
    sendMessage,
  };
};
