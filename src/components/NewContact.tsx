import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import appLogo from '../assets/echo_face.svg';
import { Contact, db } from '../db';
import { useAccountStore } from '../stores/accountStore';
import { isValidUserId } from '../utils/addressUtils';
import { validateUsername } from '../utils/validation';
import { useFileShareContact } from '../hooks/useFileShareContact';
import { UserPublicKeys } from '../assets/generated/wasm/echo_wasm';
import Popover from './Popover';
import BaseModal from './ui/BaseModal';
import { generateUserKeys } from '../wasm';
import bs58check from 'bs58check';

interface NewContactProps {
  onCancel: () => void;
  onCreated: (contact: Contact) => void;
}

const NewContact: React.FC<NewContactProps> = ({ onCancel, onCreated }) => {
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [publicKeys, setPublicKeys] = useState<UserPublicKeys | null>(null);
  const { userProfile } = useAccountStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [userIdError, setUserIdError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    fileContact,
    importFileContact,
    error: importFileContactError,
    isLoading: isImportingFileContact,
  } = useFileShareContact();
  const [activeImportTab, setActiveImportTab] = useState<'file' | 'qr'>('file');

  const isValid = useMemo(() => {
    return validateUsername(name).valid && isValidUserId(userId);
  }, [name, userId]);

  const validateName = useCallback((value: string) => {
    if (!value.trim()) {
      setNameError(null);
      return false;
    }
    const result = validateUsername(value);
    if (!result.valid) {
      setNameError(result.error || 'Invalid username');
      return false;
    }
    setNameError(null);
    return true;
  }, []);

  const validateUserId = useCallback((value: string) => {
    if (!value.trim()) {
      setUserIdError(null);
      return false;
    }
    if (!isValidUserId(value)) {
      setUserIdError('Please enter a valid base58 encoded user ID');
      return false;
    }
    setUserIdError(null);
    return true;
  }, []);

  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const handleBack = useCallback(() => {
    if (name || userId) {
      setIsDiscardModalOpen(true);
      return;
    }
    onCancel();
  }, [name, userId, onCancel]);

  const handleFileImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await importFileContact(file);
    },
    [importFileContact]
  );

  // When a file contact is imported, map it to the form fields
  useEffect(() => {
    if (!fileContact) return;
    try {
      const publicKeys = UserPublicKeys.from_bytes(fileContact.userPubKeys);
      setPublicKeys(publicKeys);
      const userIdString = bs58check.encode(publicKeys.derive_id());
      validateUserId(userIdString);
      setUserId(userIdString);

      if (fileContact.userName) {
        setName(fileContact.userName);
        validateName(fileContact.userName);
      }
      setError(null);
    } catch (e) {
      setError(
        `Failed to process imported contact: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, [fileContact, validateName, validateUserId]);

  const handleGenerate = useCallback(async () => {
    const nameIsValid = validateUsername(name).valid;
    if (!nameIsValid || userId || isSubmitting) return;
    try {
      const newUserKeys = await generateUserKeys(`test_user_${name.trim()}`);
      const pub = newUserKeys.public_keys();
      setPublicKeys(pub);
      setUserId(bs58check.encode(pub.derive_id()));
      setUserIdError(null);
    } catch (e) {
      console.error(e);
      setUserIdError('Failed to generate user ID. Please try again.');
    }
  }, [name, userId, isSubmitting]);

  const handleSubmit = useCallback(async () => {
    if (!isValid || !publicKeys) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Ensure unique contact name (case-insensitive)
      if (!userProfile?.userId) throw new Error('No authenticated user');
      const duplicateByName = await db
        .getContactsByOwner(userProfile.userId)
        .then(list =>
          list.find(c => c.name.toLowerCase() === name.trim().toLowerCase())
        );
      if (duplicateByName) {
        setNameError('This name is already used by another contact.');
        setIsSubmitting(false);
        return;
      }

      const contact: Omit<Contact, 'id'> = {
        ownerUserId: userProfile.userId,
        name: name.trim(),
        userId: userId.trim(),
        publicKeys: publicKeys.to_bytes(),
        avatar: undefined,
        isOnline: false,
        lastSeen: new Date(),
        createdAt: new Date(),
      };

      // Ensure unique user ID
      const existing = await db.getContactByOwnerAndUserId(
        userProfile.userId,
        contact.userId
      );

      if (existing) {
        setError('This user ID already exists in your contacts.');
        setIsSubmitting(false);
        return;
      }

      await db.contacts.add(contact);
      onCreated(contact);
    } catch (e) {
      console.error(e);
      setError('Failed to create contact. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, publicKeys, userProfile?.userId, name, userId, onCreated]);

  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg
                  className="w-5 h-5 text-gray-600 dark:text-gray-300"
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
              <img
                src={appLogo}
                className="w-9 h-9 rounded object-cover"
                alt="Echo logo"
              />
              <h1 className="text-xl font-semibold text-black dark:text-white">
                New contact
              </h1>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-4 pb-20">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-5">
            {/* Import Tabs */}
            <div className="space-y-4">
              <div className="w-full p-1 bg-gray-100 dark:bg-gray-800 rounded-lg relative h-10 flex items-center">
                <div
                  className={`absolute top-1 bottom-1 w-1/2 rounded-md bg-white dark:bg-gray-700 shadow transition-transform duration-200 ease-out ${
                    activeImportTab === 'file'
                      ? 'translate-x-0'
                      : 'translate-x-full'
                  }`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => setActiveImportTab('file')}
                  className={`relative z-10 flex-1 h-8 inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${
                    activeImportTab === 'file'
                      ? 'text-black dark:text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                  aria-pressed={activeImportTab === 'file'}
                >
                  Import from file
                </button>
                <button
                  type="button"
                  onClick={() => setActiveImportTab('qr')}
                  className={`relative z-10 flex-1 h-8 inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${
                    activeImportTab === 'qr'
                      ? 'text-black dark:text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                  aria-pressed={activeImportTab === 'qr'}
                >
                  Import from QR code
                </button>
              </div>

              {activeImportTab === 'file' && (
                <div className="p-4">
                  <p className="text-[15px] font-medium text-[#4a4a4a] dark:text-gray-300 mb-4">
                    Import a contact from a .yaml file
                  </p>
                  <div className="flex justify-center items-center gap-2 relative">
                    <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors duration-200 text-sm font-medium cursor-pointer">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".yaml,.yml"
                        className="hidden"
                        onChange={handleFileImport}
                        disabled={isImportingFileContact}
                      />
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                      <span>Import</span>
                    </label>
                    <Popover message="You can setup a discussion with a Gossip user by importing its .yaml file" />
                  </div>
                </div>
              )}

              {activeImportTab === 'qr' && (
                <div className="p-4">
                  <p className="text-[15px] font-medium text-[#4a4a4a] dark:text-gray-300">
                    Import from QR code (coming soon).
                  </p>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-200 dark:bg-gray-700" />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  validateName(e.target.value);
                }}
                onBlur={e => validateName(e.target.value)}
                placeholder="Enter contact name"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 ${
                  nameError
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {nameError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {nameError}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                User ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userId}
                  onChange={e => {
                    setUserId(e.target.value);
                    validateUserId(e.target.value);
                  }}
                  onBlur={e => validateUserId(e.target.value)}
                  placeholder="Enter base58check encoded user ID"
                  className={`flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 ${
                    userIdError
                      ? 'border-red-500 dark:border-red-500'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={async () => {
                    await handleGenerate();
                  }}
                  disabled={
                    !validateUsername(name).valid || !!userId || isSubmitting
                  }
                  className="px-3 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
                  title="Generate random user ID"
                >
                  Generate
                </button>
              </div>
              {userIdError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {userIdError}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                User ID is a unique 32-byte identifier
              </p>
            </div>

            {(error || importFileContactError) && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {error || importFileContactError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              className="w-full bg-purple-600 dark:bg-purple-700 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 dark:hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Saving…' : 'Save contact'}
            </button>
          </div>
        </div>
      </div>
      {/* Discard confirm modal */}
      <BaseModal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        title="Discard new contact?"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Your changes will be lost.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsDiscardModalOpen(false);
                onCancel();
              }}
              className="flex-1 h-11 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              Discard
            </button>
            <button
              onClick={() => setIsDiscardModalOpen(false)}
              className="flex-1 h-11 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      </BaseModal>
    </div>
  );
};

export default NewContact;
