import React, { useRef, useLayoutEffect, useCallback, useMemo } from 'react';
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
  const prevMessagesLengthRef = useRef(0);
  const hasInitiallyScrolledRef = useRef(false);
  const wasLoadingRef = useRef(isLoading);

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const threshold = 80; // px
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  // Track the last message to detect new messages or status changes
  const lastMessage = useMemo(() => {
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }, [messages]);

  // Create a signature of the last message to detect changes
  const lastMessageSignature = useMemo(() => {
    if (!lastMessage) return null;
    return `${lastMessage.id}-${lastMessage.status}-${lastMessage.content}`;
  }, [lastMessage]);

  const prevLastMessageSignatureRef = useRef<string | null>(null);

  // Scroll intelligently after DOM updates
  useLayoutEffect(() => {
    // Track when loading finishes
    const justFinishedLoading = wasLoadingRef.current && !isLoading;
    wasLoadingRef.current = isLoading;

    if (messages.length === 0) {
      prevMessagesLengthRef.current = 0;
      prevLastMessageSignatureRef.current = null;
      hasInitiallyScrolledRef.current = false;
      return;
    }

    // On initial load (first time messages appear after loading), scroll instantly to bottom
    if (justFinishedLoading && !hasInitiallyScrolledRef.current) {
      hasInitiallyScrolledRef.current = true;
      // Scroll instantly without animation on initial load
      // Use double requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = containerRef.current;
          if (container) {
            // Direct scroll to bottom - instant, no animation
            container.scrollTop = container.scrollHeight;
          } else {
            // Fallback to scrollIntoView if container ref not available
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
          }
        });
      });
      prevMessagesLengthRef.current = messages.length;
      prevLastMessageSignatureRef.current = lastMessageSignature;
      return;
    }

    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    const isLastMessageChanged =
      lastMessageSignature !== null &&
      lastMessageSignature !== prevLastMessageSignatureRef.current;
    const isNearBottomNow = isNearBottom();
    const isLastMessageOutgoing = lastMessage?.direction === 'outgoing';

    // Always scroll to bottom if:
    // 1. A new message was added (always scroll for new messages)
    // 2. The last message changed (status/content changed) and:
    //    - It's an outgoing message (user sent it, so always show it)
    //    - OR user is already near the bottom (for incoming messages)
    const shouldScroll =
      isNewMessage ||
      (isLastMessageChanged && (isLastMessageOutgoing || isNearBottomNow));

    if (shouldScroll) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Update refs for next render
    prevMessagesLengthRef.current = messages.length;
    prevLastMessageSignatureRef.current = lastMessageSignature;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, lastMessageSignature, isNearBottom, isLoading]);

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
