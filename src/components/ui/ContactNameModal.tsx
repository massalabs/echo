import React, { useEffect, useState } from 'react';
import BaseModal from './BaseModal';
import Button from './Button';

interface ContactNameModalProps {
  isOpen: boolean;
  title: string;
  initialName: string;
  confirmLabel: string;
  allowEmpty?: boolean;
  showSkip?: boolean;
  error?: string | null;
  onConfirm: (name?: string) => void;
  onClose: () => void;
  onSkip?: () => void;
}

const ContactNameModal: React.FC<ContactNameModalProps> = ({
  isOpen,
  title,
  initialName,
  confirmLabel,
  allowEmpty = false,
  showSkip = false,
  error,
  onConfirm,
  onClose,
  onSkip,
}) => {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (isOpen) setName(initialName);
  }, [isOpen, initialName]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!allowEmpty && trimmed.length === 0) {
      // Let parent surface the error; still pass empty to indicate invalid attempt
      onConfirm('');
      return;
    }
    onConfirm(trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Name
          </label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-600"
            placeholder="Enter a name"
          />
          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handleConfirm}
            variant="primary"
            size="custom"
            className="flex-1 h-11 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
          >
            {confirmLabel}
          </Button>
          {showSkip ? (
            <Button
              onClick={onSkip}
              variant="secondary"
              size="custom"
              className="flex-1 h-11 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
            >
              Skip
            </Button>
          ) : (
            <Button
              onClick={onClose}
              variant="secondary"
              size="custom"
              className="flex-1 h-11 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </BaseModal>
  );
};

export default ContactNameModal;
