import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Contact } from '../db';
import { formatUserId } from '../utils/addressUtils';
import { formatTime } from '../utils/timeUtils';
import ContactAvatar from './avatar/ContactAvatar';
import { useMessages } from '../hooks/useMessages';
import { useDiscussion } from '../hooks/useDiscussion';

interface DiscussionProps {
  contact: Contact;
  onBack: () => void;
  onDiscussionCreated?: () => void;
}

const Discussion: React.FC<DiscussionProps> = ({
  contact,
  onBack,
  onDiscussionCreated,
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    discussion,
    isInitializing,
    isLoading: isDiscussionLoading,
    ensureDiscussionExists,
  } = useDiscussion({ contact });

  const { messages, isLoading, isSending, loadMessages, sendMessage } =
    useMessages({
      contact,
      discussionId: discussion?.id,
      onDiscussionRequired: ensureDiscussionExists,
      onMessageSent: onDiscussionCreated,
    });

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Notify parent when discussion is created
  useEffect(() => {
    if (discussion && onDiscussionCreated) {
      onDiscussionCreated();
    }
  }, [discussion, onDiscussionCreated]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim()) return;

    const success = await sendMessage(newMessage);
    if (success) {
      setNewMessage('');
    }
  }, [newMessage, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 120);
    textarea.style.height = `${newHeight}px`;
    setInputHeight(newHeight);
  };

  const adjustTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(
        Math.max(textareaRef.current.scrollHeight, 40),
        120
      );
      textareaRef.current.style.height = `${newHeight}px`;
      setInputHeight(newHeight);
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [newMessage, adjustTextareaHeight]);

  return (
    <div className="h-screen bg-[#f5f5f5] dark:bg-gray-900 flex flex-col">
      <div className="max-w-sm mx-auto w-full h-full flex flex-col">
        {/* Header - modern mobile app style */}
        <div className="h-16 flex items-center bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center w-full px-4">
            {/* Back button */}
            <button
              onClick={onBack}
              className="w-10 h-10 flex items-center justify-center mr-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-full -ml-2"
            >
              <svg
                className="w-5 h-5 text-gray-600 dark:text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>

            {/* Contact info */}
            <div className="flex items-center flex-1 min-w-0">
              <ContactAvatar contact={contact} size={10} />
              <div className="ml-3 flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {contact.name}
                </h1>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {formatUserId(contact.userId)}
                  </p>
                  {discussion && (
                    <div
                      className="flex items-center gap-1"
                      title="End-to-end encrypted"
                    >
                      <svg
                        className="w-3 h-3 text-green-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                    </div>
                  )}
                  <span
                    className={`w-2 h-2 rounded-full ${
                      contact.isOnline ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                    title={contact.isOnline ? 'Online' : 'Offline'}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Messages - modern chat layout */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {isLoading || isDiscussionLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : isInitializing ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Initializing secure discussion...
                </p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-gray-400 dark:text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No messages yet
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Start the conversation by typing a message below
              </p>
            </div>
          ) : (
            messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-3 rounded-2xl shadow-sm ${
                    message.direction === 'outgoing'
                      ? 'bg-blue-500 text-white rounded-br-md'
                      : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-bl-md'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                  <p
                    className={`text-xs mt-1.5 ${
                      message.direction === 'outgoing'
                        ? 'text-blue-100'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modern input composer */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                inputMode="text"
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck="true"
                className="w-full min-h-[40px] max-h-[120px] px-4 py-3 pr-12 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none transition-all duration-200 overflow-hidden scrollbar-hide"
                disabled={isSending || isInitializing}
                style={
                  {
                    height: `${inputHeight}px`,
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                  } as React.CSSProperties
                }
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending || isInitializing}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-full flex items-center justify-center transition-all duration-200 disabled:cursor-not-allowed"
              >
                {isSending || isInitializing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Discussion;
