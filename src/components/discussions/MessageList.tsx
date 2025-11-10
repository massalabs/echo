import React, { useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { Message, Contact, Discussion } from '../../db';
import MessageItem from './MessageItem';
import LoadingState from './LoadingState';
import EmptyState from './EmptyState';

interface MessageListProps {
  messages: Message[];
  contact: Contact;
  discussion?: Discussion | null;
  isLoading: boolean;
  onResend: (message: Message) => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  contact,
  discussion,
  isLoading,
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
  }, [
    messages.length,
    lastMessageSignature,
    isNearBottom,
    isLoading,
    lastMessage?.direction,
  ]);

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-6 space-y-4 relative bg-transparent"
    >
      {/* Display announcement message if it exists */}
      {discussion?.announcementMessage && (
        <div className="flex justify-center mb-4">
          <div className="max-w-[85%] sm:max-w-[75%] md:max-w-[70%] px-4 py-3 bg-muted/50 border border-border rounded-xl">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              Contact request message:
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {discussion.announcementMessage}
            </p>
          </div>
        </div>
      )}

      {messages.length === 0 && !discussion?.announcementMessage ? (
        <EmptyState />
      ) : (
        messages.map((message, index) => {
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
              onResend={onResend}
            />
          );
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
