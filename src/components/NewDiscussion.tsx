import React, { useEffect, useMemo, useState } from 'react';
import { Contact, db } from '../db';
import { formatMassaAddress } from '../utils/addressUtils';
import ContactAvatar from './avatar/ContactAvatar';

interface NewDiscussionProps {
  onClose: () => void;
  onSelectRecipient: (contact: Contact) => void;
  onNewContact?: () => void;
  onNewGroup?: () => void;
}

const NewDiscussion: React.FC<NewDiscussionProps> = ({
  onClose,
  onSelectRecipient,
  onNewContact,
  onNewGroup,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadContacts = async () => {
      try {
        setIsLoading(true);
        const list = await db.contacts.orderBy('name').toArray();
        if (isMounted) {
          setContacts(list);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadContacts();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredContacts = useMemo(() => contacts, [contacts]);

  const handleClose = () => onClose();

  return (
    <div className="min-h-screen bg-[#efefef] dark:bg-gray-900 px-3 py-3">
      <div className="max-w-sm mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden">
          {/* Card header */}
          <div className="relative px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-center text-base font-semibold text-gray-900 dark:text-white">
              New discussion
            </h2>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="absolute right-3 top-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg
                className="w-5 h-5 text-gray-600 dark:text-gray-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Actions: New group / New contact */}
          <div className="px-4 pt-4">
            <div className="space-y-3">
              <button
                onClick={onNewGroup ?? (() => {})}
                className="w-full flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
              >
                <span className="inline-flex w-6 h-6 items-center justify-center">
                  <svg
                    className="w-5 h-5 text-gray-700 dark:text-gray-200"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  New group
                </span>
              </button>

              <button
                onClick={onNewContact ?? (() => {})}
                className="w-full flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
              >
                <span className="inline-flex w-6 h-6 items-center justify-center">
                  <svg
                    className="w-5 h-5 text-gray-700 dark:text-gray-200"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  New contact
                </span>
              </button>
            </div>
          </div>

          {/* Contacts list */}
          <div className="mt-4 border-t border-gray-200 dark:border-gray-700">
            {isLoading ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                Loading contacts…
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <p className="text-sm">No contacts yet</p>
                <p className="text-xs mt-1">Tap “New contact” to add one</p>
              </div>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto">
                {filteredContacts.map(contact => {
                  return (
                    <li key={contact.id}>
                      <button
                        onClick={() => onSelectRecipient(contact)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                      >
                        <ContactAvatar contact={contact} size={10} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {contact.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {formatMassaAddress(contact.address)}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewDiscussion;
