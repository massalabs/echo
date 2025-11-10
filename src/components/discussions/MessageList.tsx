import React, { useMemo, useEffect, useRef } from 'react';
import * as ReactScroll from 'react-scroll';
import { Message, Contact } from '../../db';

const { scroller, Element } = ReactScroll;
import MessageItem from './MessageItem';
import LoadingState from './LoadingState';
import EmptyState from './EmptyState';

interface MessageListProps {
  messages: Message[];
  contact: Contact;
  isLoading: boolean;
  onResend: (message: Message) => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  onResend,
}) => {
  const prevLastMessageIdRef = useRef<number | null>(null);
  const hasInitiallyScrolledRef = useRef<boolean>(false);

  // Memoize the message items to prevent re-rendering all messages when one is added
  const messageItems = useMemo(() => {
    return messages.map(message => {
      return (
        <MessageItem key={message.id} message={message} onResend={onResend} />
      );
    });
  }, [messages, onResend]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (isLoading) return;

    const lastMessage = messages[messages.length - 1];
    const currentLastMessageId = lastMessage?.id || null;
    const prevLastMessageId = prevLastMessageIdRef.current;

    // Scroll on initial load or when the last message changes (new message added)
    const shouldScroll =
      !hasInitiallyScrolledRef.current ||
      (currentLastMessageId !== null &&
        currentLastMessageId !== prevLastMessageId);

    if (shouldScroll) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scroller.scrollTo('messagesEnd', {
          duration: 300,
          delay: 0,
          smooth: true,
          containerId: 'messagesContainer',
        });
      });
      hasInitiallyScrolledRef.current = true;
    }

    prevLastMessageIdRef.current = currentLastMessageId;
  }, [messages.length, isLoading, messages]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div
      id="messagesContainer"
      className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-6 space-y-4"
    >
      {messageItems}
      <Element name="messagesEnd" />
    </div>
  );
};

export default MessageList;
