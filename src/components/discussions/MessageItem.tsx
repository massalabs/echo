import React from 'react';
import { Message, Contact } from '../../db';
import { formatTime } from '../../utils/timeUtils';
import ContactAvatar from '../avatar/ContactAvatar';

interface MessageItemProps {
  message: Message;
  contact: Contact;
  showAvatar: boolean;
  isSending: boolean;
  onResend: (message: Message) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  contact,
  showAvatar,
  isSending,
  onResend,
}) => {
  const isOutgoing = message.direction === 'outgoing';

  return (
    <div
      className={`flex items-end gap-2 ${isOutgoing ? 'justify-end' : 'justify-start'} group`}
    >
      {!isOutgoing && (
        <div className="w-8 h-8 shrink-0 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {showAvatar && <ContactAvatar contact={contact} size={8} />}
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
            <div className="flex items-center gap-1">
              {message.status === 'sending' && (
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-medium">Sending</span>
                </div>
              )}
              {message.status === 'sent' && (
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
              {message.status === 'failed' && (
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-3.5 h-3.5 text-red-300"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-[10px] font-medium">Failed</span>
                  <button
                    onClick={() => onResend(message)}
                    disabled={isSending}
                    className="ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-white/20 hover:bg-white/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Resend message"
                  >
                    Resend
                  </button>
                </div>
              )}
              {(message.status === 'delivered' ||
                message.status === 'read') && (
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
          )}
        </div>
      </div>
      {isOutgoing && <div className="w-8 h-8 shrink-0 mb-1"></div>}
    </div>
  );
};

export default MessageItem;
