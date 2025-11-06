import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Contact } from '../../db';
import { formatUserId } from '../../utils/userId';
import { formatTime } from '../../utils/timeUtils';
import ContactAvatar from '../avatar/ContactAvatar';
import { useMessages } from '../../hooks/useMessages';
import { useDiscussion } from '../../hooks/useDiscussion';
import Button from '../ui/Button';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const DiscussionContent: React.FC<{ contact: Contact }> = ({ contact }) => {
  const navigate = useNavigate();
  const onBack = () => navigate(-1);
  const [newMessage, setNewMessage] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    discussion,
    isInitializing,
    isLoading: isDiscussionLoading,
  } = useDiscussion({ contact });

  const {
    messages,
    isLoading,
    isSending,
    isSyncing,
    loadMessages,
    sendMessage,
    syncMessages,
  } = useMessages({
    contact,
    discussionId: discussion?.id,
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      scrollToBottom();
    }
  }, [isLoading, messages.length, scrollToBottom]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim()) return;
    try {
      await sendMessage(newMessage);
      setNewMessage('');
    } catch (error) {
      toast.error('Failed to send message');
      console.error('Failed to send message:', error);
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
    const textarea = e.target;
    textarea.style.height = 'auto';
    const minHeight = window.innerWidth >= 768 ? 40 : 36;
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), 120);
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

  useEffect(() => {
    if (messages.length > 0) {
      const timeoutId = setTimeout(() => {
        scrollToBottom();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, scrollToBottom]);

  return (
    <div className="h-full flex flex-col w-full">
      <div className="w-full h-full flex flex-col">
        <div className="h-[72px] flex items-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800/50 shadow-sm">
          <div className="flex items-center w-full px-5">
            <Button
              onClick={onBack}
              variant="circular"
              size="custom"
              className="w-11 h-11 flex items-center justify-center mr-2 group"
            >
              <svg
                className="w-6 h-6 text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Button>

            <div className="flex items-center flex-1 min-w-0">
              <div className="relative">
                <ContactAvatar contact={contact} size={12} />
                {contact.isOnline && (
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full shadow-sm"></span>
                )}
              </div>
              <div
                className="ml-3.5 flex-1 min-w-0"
                onClick={() => navigate(`/contact/${contact.userId}`)}
              >
                <div className="flex items-center gap-2">
                  <h1 className="text-[17px] font-semibold text-gray-900 dark:text-white truncate leading-tight">
                    {contact.name}
                  </h1>
                  {discussion && (
                    <svg
                      className="w-4 h-4 text-emerald-500 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate font-medium">
                    {formatUserId(contact.userId)}
                  </p>
                  {isSyncing && (
                    <div className="flex items-center gap-1.5 ml-1">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                        Syncing...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {discussion && (
                <div className="flex items-center gap-2 ml-2">
                  <Button
                    onClick={syncMessages}
                    disabled={isSyncing}
                    loading={isSyncing}
                    variant="circular"
                    size="custom"
                    className="w-9 h-9 flex items-center justify-center"
                    title="Sync messages"
                  >
                    {!isSyncing && (
                      <svg
                        className="w-5 h-5 text-gray-600 dark:text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-6 space-y-4 relative bg-transparent">
          {isLoading || isDiscussionLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-[3px] border-gray-200 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Loading messages...
                </p>
              </div>
            </div>
          ) : isInitializing ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 border-[3px] border-blue-100 dark:border-blue-900/30 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin"></div>
                  <div
                    className="absolute inset-0 w-12 h-12 border-[3px] border-transparent border-r-blue-600/30 dark:border-r-blue-500/30 rounded-full animate-spin"
                    style={{
                      animationDirection: 'reverse',
                      animationDuration: '1.5s',
                    }}
                  ></div>
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-gray-900 dark:text-white mb-1">
                    Initializing secure discussion
                  </p>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400">
                    Setting up end-to-end encryption...
                  </p>
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 px-6">
              <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center shadow-lg">
                <svg
                  className="w-12 h-12 text-gray-400 dark:text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337L5 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No messages yet
              </h3>
              <p className="text-[14px] text-gray-500 dark:text-gray-400 text-center max-w-xs leading-relaxed">
                Start the conversation by sending your first message
              </p>
            </div>
          ) : (
            messages.map((message, index) => {
              const isOutgoing = message.direction === 'outgoing';
              const showAvatar =
                !isOutgoing &&
                (index === 0 || messages[index - 1]?.direction === 'outgoing');

              return (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${isOutgoing ? 'justify-end' : 'justify-start'} group`}
                >
                  {!isOutgoing && (
                    <div className="w-8 h-8 shrink-0 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {showAvatar && (
                        <ContactAvatar contact={contact} size={8} />
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] sm:max-w-[70%] md:max-w-[65%] lg:max-w-[60%] px-4 py-2.5 md:px-5 md:py-3 rounded-2xl shadow-sm transition-all duration-200 ${
                      isOutgoing
                        ? 'bg-blue-600 text-white rounded-br-[6px] shadow-blue-500/20'
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700/50 rounded-bl-[6px] shadow-gray-900/5'
                    }`}
                  >
                    <p
                      className={`text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word ${isOutgoing ? 'text-white' : 'text-gray-900 dark:text-white'}`}
                    >
                      {message.content}
                    </p>
                    <div
                      className={`flex items-center justify-end gap-1.5 mt-1.5 ${isOutgoing ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}
                    >
                      <span className="text-[11px] font-medium">
                        {formatTime(message.timestamp)}
                      </span>
                      {isOutgoing && (
                        <svg
                          className="w-3.5 h-3.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  {isOutgoing && <div className="w-8 h-8 shrink-0 mb-1"></div>}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-100 dark:border-gray-800/50 px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-end gap-2 md:gap-3">
            <div className="flex-1 flex items-end gap-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-2xl px-3 md:px-4 py-2 md:py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50 transition-all duration-200">
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
                className="flex-1 min-h-[36px] md:min-h-[40px] max-h-[120px] bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none transition-all duration-200 overflow-y-auto text-[15px] md:text-base leading-relaxed focus:outline-none"
                disabled={isSending || isInitializing}
                style={
                  {
                    height: `${Math.max(inputHeight, 36)}px`,
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent',
                  } as React.CSSProperties
                }
              />
              <Button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending || isInitializing}
                loading={isSending || isInitializing}
                variant="gradient-blue"
                size="custom"
                className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-full flex items-center justify-center shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30"
                title="Send message"
              >
                {!(isSending || isInitializing) && (
                  <svg
                    className="w-4 h-4 md:w-5 md:h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                    />
                  </svg>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscussionContent;
