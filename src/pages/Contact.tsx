import React, { useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { formatMassaAddress } from '../utils/addressUtils';

import { useDiscussionList } from '../hooks/useDiscussionList';
import ContactAvatar from '../components/avatar/ContactAvatar';
import { useFileShareContact } from '../hooks/useFileShareContact';
import { useAccountStore } from '../stores/accountStore';
import ContactNameModal from '../components/ui/ContactNameModal';
import { updateContactName } from '../utils/contacts';
import Button from '../components/ui/Button';
import CopyClipboard from '../components/ui/CopyClipboard';

const Contact: React.FC = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { selectors } = useDiscussionList();
  const contact = userId ? selectors.getContactByUserId(userId) : undefined;

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

  const handleSaveName = useCallback(async () => {
    if (!ownerUserId || !contact) return;
    const result = await updateContactName(
      ownerUserId,
      contact.userId,
      proposedName
    );
    if (!result.ok) {
      setNameError(result.message);
      return;
    }
    setDisplayName(result.trimmedName);
    setIsNameModalOpen(false);
  }, [ownerUserId, proposedName, contact]);

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

  const disc = selectors.getDiscussionByContactUserId(contact.userId);
  const canStart = disc ? disc.status === 'active' : true;

  const onBack = () => navigate('/');

  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto h-screen-mobile flex flex-col">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button
            onClick={onBack}
            variant="ghost"
            size="custom"
            className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
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
          </Button>
          <h1 className="text-xl font-semibold text-black dark:text-white">
            Contact
          </h1>
        </div>

        <div className="flex-1 px-4 pb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center gap-4">
              <ContactAvatar contact={contact} size={14} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
                  {displayName}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {formatMassaAddress(contact.userId)}
                  </p>
                  <CopyClipboard text={contact.userId} title="Copy user ID" />
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2">
              <Button
                onClick={handleOpenEditName}
                disabled={!canEditName}
                variant="outline"
                size="custom"
                fullWidth
                className="h-[46px] rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-black dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Edit name
              </Button>
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
            setProposedName(name);
            await handleSaveName();
          }}
        />
      </div>
    </div>
  );
};

export default Contact;
