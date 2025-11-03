import React, { useState } from 'react';
import { Discussion, Contact } from '../../db';
import ContactAvatar from '../avatar/ContactAvatar';
import { formatRelativeTime } from '../../utils/timeUtils';
import { formatUserId } from '../../utils/addressUtils';
import BaseModal from '../ui/BaseModal';
import ContactNameModal from '../ui/ContactNameModal';

export type LastMessageInfo = { content: string; timestamp: Date } | undefined;

interface DiscussionListItemProps {
  discussion: Discussion;
  contact: Contact;
  lastMessage: LastMessageInfo;
  isPendingIncoming: boolean;
  isPendingOutgoing: boolean;
  onSelect: (discussion: Discussion) => void;
  onAccept: (discussion: Discussion, newName?: string) => void;
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
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [proposedName, setProposedName] = useState(contact.name || '');
  const [isRefuseModalOpen, setIsRefuseModalOpen] = useState(false);

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
              <>
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 break-all">
                  User Id: {formatUserId(contact.userId)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setProposedName(contact.name || '');
                      setIsNameModalOpen(true);
                    }}
                    className="px-2.5 py-1 text-xs font-medium rounded border border-green-600 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                  >
                    Accept
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setIsRefuseModalOpen(true);
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
                {/* Name prompt modal */}
                <ContactNameModal
                  isOpen={isNameModalOpen}
                  onClose={() => setIsNameModalOpen(false)}
                  title="Set contact name"
                  initialName={proposedName}
                  confirmLabel="Continue"
                  allowEmpty
                  showSkip
                  onConfirm={name => {
                    setIsNameModalOpen(false);
                    if (name && name.trim()) {
                      onAccept(discussion, name.trim());
                    } else {
                      onAccept(discussion);
                    }
                  }}
                  onSkip={() => {
                    setIsNameModalOpen(false);
                    onAccept(discussion);
                  }}
                />
                {/* Refuse confirm modal */}
                <BaseModal
                  isOpen={isRefuseModalOpen}
                  onClose={() => setIsRefuseModalOpen(false)}
                  title="Refuse connection?"
                >
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Refusing will close this discussion request.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setIsRefuseModalOpen(false);
                          onRefuse(discussion);
                        }}
                        className="flex-1 h-11 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
                      >
                        Refuse
                      </button>
                      <button
                        onClick={() => setIsRefuseModalOpen(false)}
                        className="flex-1 h-11 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </BaseModal>
              </>
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
