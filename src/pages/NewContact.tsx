import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import appLogo from '../assets/echo_face.svg';
import { Contact, db } from '../db';
import { useAccountStore } from '../stores/accountStore';
import { validateUsername, isValidUserId, encodeUserId } from '../utils';
import { useFileShareContact } from '../hooks/useFileShareContact';
import { UserPublicKeys } from '../assets/generated/wasm/echo_wasm';
import BaseModal from '../components/ui/BaseModal';
import { useDiscussionList } from '../hooks/useDiscussionList';
import Button from '../components/ui/Button';

const NewContact: React.FC = () => {
  const navigate = useNavigate();
  const { handlers } = useDiscussionList();
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
      setUserIdError('Please enter a valid gossip user ID (e.g. gossip1...)');
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
    navigate('/');
  }, [name, userId, navigate]);

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
      const userIdString = encodeUserId(publicKeys.derive_id());
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

  // const handleGenerate = useCallback(async () => {
  //   const nameIsValid = validateUsername(name).valid;
  //   if (!nameIsValid || userId || isSubmitting) return;
  //   try {
  //     const newUserKeys = await generateUserKeys(`test_user_${name.trim()}`);
  //     const pub = newUserKeys.public_keys();
  //     setPublicKeys(pub);
  //     setUserId(encodeUserId(pub.derive_id()));
  //     setUserIdError(null);
  //   } catch (e) {
  //     console.error(e);
  //     setUserIdError('Failed to generate user ID. Please try again.');
  //   }
  // }, [name, userId, isSubmitting]);

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
      await handlers.handleCreatedNewContact(contact);
      navigate(`/`);
    } catch (e) {
      console.error(e);
      setError('Failed to create contact. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isValid,
    publicKeys,
    userProfile?.userId,
    name,
    userId,
    handlers,
    navigate,
  ]);

  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                onClick={handleBack}
                variant="circular"
                size="custom"
                className="w-8 h-8 flex items-center justify-center"
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
              </Button>
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
            {/* Import Section */}
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Import a contact from a file
                </h3>
              </div>
              <div className="flex justify-center">
                <label className="flex items-center justify-center gap-3 px-6 py-3 bg-primary text-primary-foreground rounded-xl transition-all duration-200 text-sm font-semibold cursor-pointer hover:bg-primary/90 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed w-full max-w-xs">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".yaml,.yml"
                    className="hidden"
                    onChange={handleFileImport}
                    disabled={isImportingFileContact}
                  />
                  {isImportingFileContact ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
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
                      <span>Choose .yaml file</span>
                    </>
                  )}
                </label>
              </div>
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
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <input
                  type="text"
                  value={userId}
                  onChange={e => {
                    setUserId(e.target.value);
                    validateUserId(e.target.value);
                  }}
                  onBlur={e => validateUserId(e.target.value)}
                  placeholder="Enter gossip Bech32 user ID"
                  className={`flex-1 min-w-0 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 ${
                    userIdError
                      ? 'border-red-500 dark:border-red-500'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {/* <Button
                  type="button"
                  onClick={async () => {
                    await handleGenerate();
                  }}
                  disabled={
                    !validateUsername(name).valid || !!userId || isSubmitting
                  }
                  variant="ghost"
                  size="custom"
                  className="px-4 py-3 rounded-xl text-sm font-medium whitespace-nowrap"
                  title="Generate random user ID"
                >
                  Generate
                </Button> */}
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

            <Button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              loading={isSubmitting}
              variant="ghost"
              size="custom"
              fullWidth
              className="py-3 px-4 rounded-xl text-sm font-medium"
            >
              {!isSubmitting && 'Save contact'}
            </Button>
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
            <Button
              onClick={() => {
                setIsDiscardModalOpen(false);
                navigate('/');
              }}
              variant="danger"
              size="custom"
              className="flex-1 h-11 rounded-lg font-semibold"
            >
              Discard
            </Button>
            <Button
              onClick={() => setIsDiscardModalOpen(false)}
              variant="secondary"
              size="custom"
              className="flex-1 h-11 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
            >
              Cancel
            </Button>
          </div>
        </div>
      </BaseModal>
    </div>
  );
};

export default NewContact;
