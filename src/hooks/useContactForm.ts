// src/hooks/useContactForm.ts
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Contact, db } from '../db';
import { useAccountStore } from '../stores/accountStore';
import { validateUsername, isValidUserId, encodeUserId } from '../utils';
import { UserPublicKeys } from '../assets/generated/wasm/gossip_wasm';
import { ensureDiscussionExists } from '../crypto/discussionInit';
import { useFileShareContact } from './useFileShareContact';
import { authService } from '../services/auth';

type FieldState = {
  value: string;
  error: string | null;
  loading: boolean;
};

export function useContactForm() {
  const navigate = useNavigate();
  const { userProfile } = useAccountStore();
  const { importFileContact, fileState } = useFileShareContact();

  const publicKeysCache = useRef<Map<string, UserPublicKeys>>(new Map());

  const [name, setName] = useState<FieldState>({
    value: '',
    error: null,
    loading: false,
  });
  const [userId, setUserId] = useState<FieldState>({
    value: '',
    error: null,
    loading: false,
  });
  const [message, setMessage] = useState<FieldState>({
    value: '',
    error: null,
    loading: false,
  });

  const [publicKeys, setPublicKeys] = useState<UserPublicKeys | null>(null);

  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPublicKey = useCallback(async (uid: string) => {
    const trimmed = uid.trim();
    const cached = publicKeysCache.current.get(trimmed);

    if (cached) {
      setPublicKeys(cached);
      setUserId(prev => ({ ...prev, error: null }));
      return;
    }

    setUserId(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await authService.fetchPublicKeyByUserId(trimmed);

      if (!result.success || !result.publicKey) {
        setUserId(prev => ({
          ...prev,
          loading: false,
          error:
            result.error || 'This user ID does not exist or has no public keys',
        }));
        setPublicKeys(null);
      } else {
        publicKeysCache.current.set(trimmed, result.publicKey);
        setPublicKeys(result.publicKey);
        setUserId(prev => ({ ...prev, loading: false, error: null }));
      }
    } catch {
      setUserId(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to check user ID — please try again',
      }));
      setPublicKeys(null);
    }
  }, []);

  const canSubmit =
    name.error === null &&
    name.value.trim().length > 0 &&
    userId.error === null &&
    userId.value.trim().length > 0 &&
    publicKeys !== null &&
    !isSubmitting &&
    !userId.loading;

  const hasUnsavedChanges =
    !!name.value.trim() || !!userId.value.trim() || !!message.value.trim();

  // ──────────────────────────────────────────────────────────────
  // Handlers
  // ──────────────────────────────────────────────────────────────
  const handleNameChange = useCallback((value: string) => {
    const trimmed = value.trim();
    const error = trimmed
      ? validateUsername(trimmed).valid
        ? null
        : (validateUsername(trimmed).error ?? 'Invalid display name')
      : 'Display name is required';

    setName({ value: trimmed, error, loading: false });
  }, []);

  const handleUserIdChange = useCallback(
    (value: string) => {
      const trimmed = value.trim();

      // Reset everything
      setPublicKeys(null);
      setUserId({ value: trimmed, error: null, loading: false });

      if (!trimmed) return;

      if (!isValidUserId(trimmed)) {
        setUserId(prev => ({
          ...prev,
          error: 'Invalid format — must be a complete gossip1... address',
        }));
        return;
      }

      // Valid format → check existence
      fetchPublicKey(trimmed);
    },
    [fetchPublicKey]
  );

  const handleMessageChange = useCallback((value: string) => {
    setMessage({ value, error: null, loading: false });
  }, []);

  const handleFileImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const fileContact = await importFileContact(file);
      if (!fileContact) return;

      const pubKeys = UserPublicKeys.from_bytes(fileContact.userPubKeys);
      const derivedUserId = encodeUserId(pubKeys.derive_id());

      setPublicKeys(pubKeys);
      publicKeysCache.current.set(derivedUserId, pubKeys);

      if (fileContact.userName) {
        setName({ value: fileContact.userName, error: null, loading: false });
      }

      setUserId({ value: derivedUserId, error: null, loading: false });
    },
    [importFileContact]
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !userProfile?.userId || !publicKeys) return;

    setIsSubmitting(true);
    setGeneralError(null);

    try {
      const trimmedName = name.value.trim();
      const trimmedUserId = userId.value.trim();

      // Duplicate checks
      const contacts = await db.getContactsByOwner(userProfile.userId);
      const nameTaken = contacts.some(
        c => c.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (nameTaken) {
        setName(prev => ({
          ...prev,
          error: 'This display name is already in use',
        }));
        setIsSubmitting(false);
        return;
      }

      const existing = await db.getContactByOwnerAndUserId(
        userProfile.userId,
        trimmedUserId
      );
      if (existing) {
        setUserId(prev => ({
          ...prev,
          error: 'This user is already in your contacts',
        }));
        setIsSubmitting(false);
        return;
      }

      const contact: Omit<Contact, 'id'> = {
        ownerUserId: userProfile.userId,
        name: trimmedName,
        userId: trimmedUserId,
        publicKeys: publicKeys.to_bytes(),
        avatar: undefined,
        isOnline: false,
        lastSeen: new Date(),
        createdAt: new Date(),
      };

      await db.contacts.add(contact);

      const announcement = message.value.trim() || undefined;
      await ensureDiscussionExists(contact, undefined, announcement).catch(
        console.error
      );

      navigate('/');
    } catch (err) {
      console.error(err);
      setGeneralError('Failed to add contact. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    userProfile?.userId,
    publicKeys,
    name.value,
    userId.value,
    message.value,
    navigate,
  ]);

  return {
    name,
    userId,
    message,

    generalError,
    isSubmitting,
    fileState,

    canSubmit,
    hasUnsavedChanges,

    handleNameChange,
    handleUserIdChange,
    handleMessageChange,
    handleFileImport,
    handleSubmit,
  };
}
