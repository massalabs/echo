import React, { useCallback, useMemo, useState } from 'react';
import appLogo from '../assets/echo_face.svg';
import { Contact, db } from '../db';
import { isValidAddress } from '../utils/addressUtils';
import { validateUsername } from '../utils/validation';

interface NewContactProps {
  onCancel: () => void;
  onCreated: (contact: Contact) => void;
}

const NewContact: React.FC<NewContactProps> = ({ onCancel, onCreated }) => {
  const [name, setName] = useState('');
  const [massaAddress, setMassaAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);

  const isValid = useMemo(() => {
    return validateUsername(name) && isValidAddress(massaAddress);
  }, [name, massaAddress]);

  const validateName = useCallback((value: string) => {
    if (!value.trim()) {
      setNameError(null);
      return false;
    }
    if (!validateUsername(value)) {
      setNameError(
        'Name must be at least 2 characters and contain only letters, numbers, and spaces'
      );
      return false;
    }
    setNameError(null);
    return true;
  }, []);

  const validateAddress = useCallback((value: string) => {
    if (!value.trim()) {
      setAddressError(null);
      return false;
    }
    if (!isValidAddress(value)) {
      setAddressError('Please enter a valid Massa address');
      return false;
    }
    setAddressError(null);
    return true;
  }, []);

  const handleBack = useCallback(() => {
    if (name || massaAddress) {
      if (!window.confirm('Discard this contact?')) return;
    }
    onCancel();
  }, [name, massaAddress, onCancel]);

  const handleSubmit = useCallback(async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const contact: Omit<Contact, 'id'> = {
        name: name.trim(),
        address: massaAddress.trim(),
        avatar: undefined,
        isOnline: false,
        lastSeen: new Date(),
        createdAt: new Date(),
      };

      // Ensure unique address
      const existing = await db.getContactByAddress(contact.address);
      if (existing) {
        setError('This Massa address already exists in your contacts.');
        setIsSubmitting(false);
        return;
      }

      const id = await db.contacts.add(contact);
      const created = { ...contact, id } as Contact;
      onCreated(created);
    } catch (e) {
      console.error(e);
      setError('Failed to create contact. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, name, massaAddress, onCreated]);

  return (
    <div className="min-h-screen bg-[#efefef] dark:bg-gray-900">
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
                Massa address
              </label>
              <input
                type="text"
                value={massaAddress}
                onChange={e => {
                  setMassaAddress(e.target.value);
                  validateAddress(e.target.value);
                }}
                onBlur={e => validateAddress(e.target.value)}
                placeholder="Enter Massa address"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 ${
                  addressError
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {addressError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {addressError}
                </p>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {error}
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
    </div>
  );
};

export default NewContact;
