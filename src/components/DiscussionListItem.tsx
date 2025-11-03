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
  onSelect: (discussion: Discussion) => void;
  onAccept: (discussion: Discussion) => void;
  onRefuse: (discussion: Discussion) => void;
}

const DiscussionListItem: React.FC<DiscussionListItemProps> = ({
  discussion,
  contact,
  lastMessage,
  isPendingIncoming,
  onSelect,
  onAccept,
  onRefuse,
}) => {
  const containerClass = isPendingIncoming
    ? 'w-full px-6 py-4 text-left'
    : 'w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer';

  return (
    <div
      key={discussion.id}
      className={containerClass}
      {...(!isPendingIncoming
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
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {lastMessage && formatRelativeTime(lastMessage.timestamp)}
              </p>
            </div>
          </div>
          {isPendingIncoming ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Connection request
              </span>
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
  );
};

export default DiscussionListItem;
