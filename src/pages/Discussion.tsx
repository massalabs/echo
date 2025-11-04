import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Contact } from '../db';
import { formatUserId } from '../utils/addressUtils';
import { formatTime } from '../utils/timeUtils';
import ContactAvatar from '../components/avatar/ContactAvatar';
import { useMessages } from '../hooks/useMessages';
import { useDiscussion } from '../hooks/useDiscussion';
import { useDiscussionList } from '../hooks/useDiscussionList';
import DiscussionHeader from '../components/discussions/DiscussionHeader';
import DiscussionListItem from '../components/discussions/DiscussionListItem';
import EmptyDiscussions from '../components/discussions/EmptyDiscussions';

const DiscussionContent: React.FC<{ contact: Contact }> = ({ contact }) => {
  const navigate = useNavigate();
  const onBack = () => navigate('/');
  const onDiscussionCreated: (() => void) | undefined = undefined;
  const [newMessage, setNewMessage] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    discussion,
    isInitializing,
    isLoading: isDiscussionLoading,
    ensureDiscussionExists,
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
    onDiscussionRequired: ensureDiscussionExists,
    onMessageSent: onDiscussionCreated,
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Scroll to bottom when component first loads with messages
  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      scrollToBottom();
    }
  }, [isLoading, messages.length, scrollToBottom]);

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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      // Use a small timeout to ensure DOM is updated before scrolling
      const timeoutId = setTimeout(() => {
        scrollToBottom();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [messages, scrollToBottom]);

  return (
    <div className="h-full flex flex-col w-full">
      <div className="w-full h-full flex flex-col">
        {/* Premium Header */}
        <div className="h-[72px] flex items-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800/50 shadow-sm">
          <div className="flex items-center w-full px-5">
            {/* Back button */}
            <button
              onClick={onBack}
              className="w-11 h-11 flex items-center justify-center mr-2 hover:bg-gray-100 dark:hover:bg-gray-800/50 active:scale-95 transition-all duration-200 rounded-full group"
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
            </button>

            {/* Contact info */}
            <div className="flex items-center flex-1 min-w-0">
              <div className="relative">
                <ContactAvatar contact={contact} size={12} />
                {contact.isOnline && (
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full shadow-sm"></span>
                )}
              </div>
              <div className="ml-3.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[17px] font-semibold text-gray-900 dark:text-white truncate leading-tight">
                    {contact.name}
                  </h1>
                  {discussion && (
                    <svg
                      className="w-4 h-4 text-emerald-500 flex-shrink-0"
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

              {/* Action buttons */}
              {discussion && (
                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={syncMessages}
                    disabled={isSyncing}
                    className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800/50 active:scale-95 transition-all duration-200 rounded-full disabled:opacity-50"
                    title="Sync messages"
                  >
                    <svg
                      className={`w-5 h-5 text-gray-600 dark:text-gray-400 ${
                        isSyncing ? 'animate-spin' : ''
                      }`}
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
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Messages area with premium styling */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-6 space-y-4 relative bg-gradient-to-b from-gray-50/50 to-transparent dark:from-gray-950/50">
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
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl flex items-center justify-center shadow-lg">
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
                    <div className="w-8 h-8 flex-shrink-0 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {showAvatar && (
                        <ContactAvatar contact={contact} size={8} />
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] sm:max-w-[70%] md:max-w-[65%] lg:max-w-[60%] px-4 py-2.5 md:px-5 md:py-3 rounded-2xl shadow-sm transition-all duration-200 ${
                      isOutgoing
                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-[6px] shadow-blue-500/20'
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700/50 rounded-bl-[6px] shadow-gray-900/5'
                    }`}
                  >
                    <p
                      className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                        isOutgoing
                          ? 'text-white'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {message.content}
                    </p>
                    <div
                      className={`flex items-center justify-end gap-1.5 mt-1.5 ${
                        isOutgoing
                          ? 'text-blue-100'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
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
                  {isOutgoing && (
                    <div className="w-8 h-8 flex-shrink-0 mb-1"></div>
                  )}
                </div>
              );
            })
          )}
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

        {/* Premium input composer */}
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
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending || isInitializing}
                className="w-8 h-8 md:w-9 md:h-9 flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-all duration-200 shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 active:scale-95 disabled:shadow-none disabled:opacity-50"
                title="Send message"
              >
                {isSending || isInitializing ? (
                  <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
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
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Discussion: React.FC = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { state, selectors, handlers } = useDiscussionList();

  const contact = userId ? selectors.getContactByUserId(userId) : undefined;

  // Desktop: Show split view with discussions list + discussion
  // Mobile: Show only discussion (or empty state if no discussion selected)
  return (
    <div className="h-screen-mobile md:h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex">
      {/* Discussions List Sidebar - Desktop only */}
      <div className="hidden md:flex md:w-80 lg:w-96 flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
        <DiscussionHeader />
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="bg-card rounded-lg">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-medium text-foreground">
                Discussions
              </h2>
              <button
                onClick={handlers.handleRefresh}
                className="text-xs text-primary hover:text-primary/80 underline"
              >
                Refresh
              </button>
            </div>

            <div className="divide-y divide-border">
              {state.discussions.filter(d => d.status !== 'closed').length ===
              0 ? (
                <EmptyDiscussions />
              ) : (
                state.discussions
                  .filter(d => d.status !== 'closed')
                  .map(discussion => {
                    const listContact = selectors.getContactByUserId(
                      discussion.contactUserId
                    );
                    if (!listContact) return null;
                    const lastMessage = state.lastMessages.get(
                      discussion.contactUserId
                    );
                    const isPendingIncoming =
                      discussion.status === 'pending' &&
                      discussion.direction === 'received';
                    const isPendingOutgoing =
                      discussion.status === 'pending' &&
                      discussion.direction === 'initiated';
                    const isSelected = discussion.contactUserId === userId;

                    return (
                      <div
                        key={discussion.id}
                        className={
                          isSelected ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                        }
                      >
                        <DiscussionListItem
                          discussion={discussion}
                          contact={listContact}
                          lastMessage={lastMessage}
                          isPendingIncoming={isPendingIncoming}
                          isPendingOutgoing={isPendingOutgoing}
                          onSelect={d => {
                            handlers.handleSelectDiscussion(d);
                            navigate(`/discussion/${d.contactUserId}`);
                          }}
                          onAccept={(d, newName) =>
                            handlers.handleAcceptDiscussionRequest(d, newName)
                          }
                          onRefuse={handlers.handleRefuseDiscussionRequest}
                        />
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/new-discussion')}
          className="mx-4 mb-4 h-12 bg-primary rounded-lg flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors text-primary-foreground font-medium"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Discussion
        </button>
      </div>

      {/* Discussion Content - Always visible, full width on mobile */}
      <div className="flex-1 flex flex-col min-w-0">
        {!userId ? (
          // Desktop: Show welcome message when no discussion selected
          <div className="hidden md:flex flex-1 items-center justify-center bg-gradient-to-b from-gray-50/50 via-blue-50/30 to-transparent dark:from-gray-950/50 dark:via-blue-950/20">
            <div className="text-center max-w-lg px-8">
              <div className="w-32 h-32 mx-auto mb-8 bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 dark:from-blue-500 dark:via-blue-600 dark:to-blue-700 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-500/20 animate-pulse">
                <svg
                  className="w-16 h-16 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Welcome to Echo! 👋
              </h3>
              <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
                Your conversations are waiting. Select a discussion from the
                sidebar to continue chatting, or start a new conversation to
                connect with someone.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <svg
                  className="w-5 h-5 text-emerald-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-medium">
                  All messages are end-to-end encrypted
                </span>
              </div>
            </div>
          </div>
        ) : !contact ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Loading discussion…
              </p>
            </div>
          </div>
        ) : (
          <DiscussionContent contact={contact} />
        )}
      </div>
    </div>
  );
};

export default Discussion;
