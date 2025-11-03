import React from 'react';
import { Contact } from '../db';
import ContactAvatar from './avatar/ContactAvatar';
import { useFileShareContact } from '../hooks/useFileShareContact';

interface ContactCardProps {
  contact: Contact;
  onBack: () => void;
  onStartDiscussion: () => void;
  canStart?: boolean;
  discussionStatus?: 'pending' | 'active' | 'closed';
}

const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  onBack,
  onStartDiscussion,
  canStart = true,
  discussionStatus,
}) => {
  const { exportFileContact, isLoading, error } = useFileShareContact();
  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto h-screen-mobile flex flex-col">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
          >
            <svg
              className="w-6 h-6"
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
          <h1 className="text-xl font-semibold text-black dark:text-white">
            Contact
          </h1>
        </div>

        <div className="flex-1 px-4 pb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center gap-4">
              <ContactAvatar contact={contact} size={14} />
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
                  {contact.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {contact.userId}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2">
              <button
                onClick={onStartDiscussion}
                disabled={!canStart}
                className={`w-full h-[46px] rounded-lg font-semibold transition-colors ${
                  canStart
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 cursor-not-allowed'
                }`}
              >
                Start chat
              </button>
              <button
                onClick={() =>
                  exportFileContact({
                    userPubKeys: contact.publicKeys,
                    userName: contact.name,
                  })
                }
                disabled={isLoading}
                className="w-full h-[46px] rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-black dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-60"
              >
                Export contact (.yaml)
              </button>
              {!canStart && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {discussionStatus === 'pending' &&
                    'Connection pending. You cannot chat yet.'}
                  {discussionStatus === 'closed' &&
                    'This discussion is closed.'}
                </p>
              )}
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactCard;
