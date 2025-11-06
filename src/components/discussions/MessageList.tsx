import React, { useRef, useLayoutEffect, useCallback } from 'react';
import { Message, Contact } from '../../db';
import MessageItem from './MessageItem';
import LoadingState from './LoadingState';
import InitializingState from './InitializingState';
import EmptyState from './EmptyState';

interface MessageListProps {
  messages: Message[];
  contact: Contact;
  isLoading: boolean;
  isInitializing: boolean;
  isSending: boolean;
  onResend: (message: Message) => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  contact,
  isLoading,
  isInitializing,
  isSending,
  onResend,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const threshold = 80; // px
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  // Scroll intelligently after DOM updates without arbitrary timeouts
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    if (isNearBottom()) {
      // Only auto-scroll if the user is already near the bottom
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (isInitializing) {
    return <InitializingState />;
  }

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-6 space-y-4 relative bg-transparent"
    >
      {messages.map((message, index) => {
        const isOutgoing = message.direction === 'outgoing';
        const showAvatar =
          !isOutgoing &&
          (index === 0 || messages[index - 1]?.direction === 'outgoing');

        return (
          <MessageItem
            key={message.id}
            message={message}
            contact={contact}
            showAvatar={showAvatar}
            isSending={isSending}
            onResend={onResend}
          />
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
