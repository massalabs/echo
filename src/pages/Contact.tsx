import React, { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { updateContactName, formatUserId } from '../utils';
import { useDiscussionStore } from '../stores/discussionStore';
import ContactAvatar from '../components/avatar/ContactAvatar';
import { useFileShareContact } from '../hooks/useFileShareContact';
import { useAccountStore } from '../stores/accountStore';
import ContactNameModal from '../components/ui/ContactNameModal';
import Button from '../components/ui/Button';
import BackButton from '../components/ui/BackButton';
import CopyClipboard from '../components/ui/CopyClipboard';

const Contact: React.FC = () => {
  const { userId } = useParams();
  const getContactByUserId = useDiscussionStore(s => s.getContactByUserId);
  const getDiscussionByContactUserId = useDiscussionStore(
    s => s.getDiscussionByContactUserId
  );
  const contact = userId ? getContactByUserId(userId) : undefined;

  // All hooks must be called before early return
  const { exportFileContact, isLoading, error } = useFileShareContact();
  const ownerUserId = useAccountStore(s => s.userProfile?.userId);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [proposedName, setProposedName] = useState(contact?.name || '');
  const [displayName, setDisplayName] = useState(contact?.name || '');
  const [nameError, setNameError] = useState<string | null>(null);

  // Update state when contact changes
  React.useEffect(() => {
    if (contact) {
      setProposedName(contact.name);
      setDisplayName(contact.name);
    }
  }, [contact]);

  const canEditName = useMemo(() => !!ownerUserId, [ownerUserId]);

  const handleOpenEditName = useCallback(() => {
    setProposedName(displayName || '');
    setNameError(null);
    setIsNameModalOpen(true);
  }, [displayName]);

  const handleSaveName = useCallback(
    async (name: string) => {
      if (!ownerUserId || !contact) return;
      const result = await updateContactName(ownerUserId, contact.userId, name);
      if (!result.ok) {
        setNameError(result.message);
        return;
      }
      setDisplayName(result.trimmedName);
      setIsNameModalOpen(false);
    },
    [ownerUserId, contact]
  );

  if (!contact) {
    return (
      <div className="min-h-screen-mobile bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Loading contact…
          </p>
        </div>
      </div>
    );
  }

  const disc = getDiscussionByContactUserId(contact.userId);
  const canStart = disc ? disc.status === 'active' : true;

  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto h-screen-mobile flex flex-col">
        <div className="px-4 py-3 flex items-center gap-3">
          <BackButton />
          <h1 className="text-xl font-semibold text-black dark:text-white">
            Contact
          </h1>
        </div>

        <div className="flex-1 px-4 pb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center gap-4">
              <ContactAvatar contact={contact} size={14} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
                    {displayName}
                  </p>
                  <button
                    onClick={handleOpenEditName}
                    disabled={!canEditName}
                    className="shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Edit contact name"
                  >
                    <svg
                      className="w-4 h-4 text-gray-500 dark:text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {formatUserId(contact.userId)}
                  </p>
                  <CopyClipboard text={contact.userId} title="Copy user ID" />
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2">
              <Button
                onClick={() =>
                  exportFileContact({
                    userPubKeys: contact.publicKeys,
                    userName: contact.name,
                  })
                }
                disabled={isLoading}
                variant="outline"
                size="custom"
                fullWidth
                className="h-[46px] rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-black dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Export contact (.yaml)
              </Button>
              {!canStart && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {disc?.status === 'pending' &&
                    'Connection pending. You cannot chat yet.'}
                  {disc?.status === 'closed' && 'This discussion is closed.'}
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
        <ContactNameModal
          isOpen={isNameModalOpen}
          onClose={() => setIsNameModalOpen(false)}
          title="Edit contact name"
          initialName={proposedName}
          confirmLabel="Save"
          error={nameError}
          onConfirm={async name => {
            if (name == null) {
              setNameError('Name cannot be empty.');
              return;
            }
            await handleSaveName(name);
          }}
        />
      </div>
    </div>
  );
};

export default Contact;
