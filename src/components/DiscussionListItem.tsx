import React from 'react';
import { Discussion, Contact } from '../db';
import ContactAvatar from './avatar/ContactAvatar';
import { formatRelativeTime } from '../utils/timeUtils';

export type LastMessageInfo = { content: string; timestamp: Date } | undefined;

interface DiscussionListItemProps {
  discussion: Discussion;
  contact: Contact;
  lastMessage: LastMessageInfo;
  isPendingIncoming: boolean;
  isPendingOutgoing: boolean;
  onSelect: (discussion: Discussion) => void;
  onAccept: (discussion: Discussion) => void;
  onRefuse: (discussion: Discussion) => void;
}

const DiscussionListItem: React.FC<DiscussionListItemProps> = ({
  discussion,
  contact,
  lastMessage,
  isPendingIncoming,
  isPendingOutgoing,
  onSelect,
  onAccept,
  onRefuse,
}) => {
  const containerClass = 'w-full px-3 py-2 text-left';

  return (
    <div key={discussion.id} className={containerClass}>
      <div
        className={`${
          isPendingIncoming || isPendingOutgoing
            ? 'cursor-not-allowed opacity-95'
            : 'cursor-pointer hover:ring-1 hover:ring-gray-200 dark:hover:ring-gray-700'
        } bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 transition-colors`}
        {...(!(isPendingIncoming || isPendingOutgoing)
          ? {
              onClick: () => onSelect(discussion),
              role: 'button',
              tabIndex: 0,
            }
          : {})}
      >
        <div className="flex items-center space-x-3">
          <ContactAvatar contact={contact} size={12} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {contact.name}
              </h3>
              <div className="flex items-center gap-2">
                {isPendingOutgoing && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Waiting acceptance
                  </span>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {lastMessage && formatRelativeTime(lastMessage.timestamp)}
                </p>
                {!isPendingIncoming && !isPendingOutgoing && (
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
              </div>
            </div>
            {isPendingIncoming ? (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onAccept(discussion);
                  }}
                  className="px-2.5 py-1 text-xs font-medium rounded border border-green-600 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                  Accept
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onRefuse(discussion);
                  }}
                  className="px-2.5 py-1 text-xs font-medium rounded border border-gray-400 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Refuse
                </button>
                {discussion.unreadCount > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center px-2 py-1 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full">
                    {discussion.unreadCount}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {lastMessage?.content || ''}
                </p>
                {discussion.unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                    {discussion.unreadCount}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscussionListItem;
