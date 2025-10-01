import React, { useState, useEffect } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { Bip39BackupDisplay } from '../crypto/bip39';

interface MnemonicBackupProps {
  onBack: () => void;
}

const MnemonicBackup: React.FC<MnemonicBackupProps> = ({ onBack }) => {
  const { userProfile, showMnemonicBackup, getMnemonicBackupInfo } =
    useAccountStore();
  const [step, setStep] = useState<'auth' | 'display'>('auth');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [backupInfo, setBackupInfo] = useState<Bip39BackupDisplay | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    // Check if mnemonic backup already exists
    const existingBackup = getMnemonicBackupInfo();
    if (existingBackup) {
      // For existing backups, start with auth screen
      setStep('auth');
    }
  }, [getMnemonicBackupInfo]);

  const handleAuthenticate = async () => {
    try {
      setIsLoading(true);
      setError('');
      setPasswordError('');

      // For biometric accounts, we don't need a password
      if (userProfile?.security?.webauthn?.credentialId) {
        const backupData = await showMnemonicBackup();
        setBackupInfo(backupData);
        setStep('display');
      } else {
        // For password accounts, we need the password
        if (!password.trim()) {
          setPasswordError('Password is required');
          setIsLoading(false);
          return;
        }

        const backupData = await showMnemonicBackup(password);
        setBackupInfo(backupData);
        setStep('display');
        setPassword('');
      }
    } catch (error) {
      console.error('Error showing mnemonic backup:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to decrypt backup. Please check your password.';
      setPasswordError(errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const copyMnemonic = async () => {
    if (!backupInfo?.mnemonic) return;

    try {
      await navigator.clipboard.writeText(backupInfo.mnemonic);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy mnemonic:', error);
    }
  };

  const renderAuthStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-black mb-2">
          Access Your Mnemonic Backup
        </h3>
        <p className="text-[15px] font-medium text-[#b2b2b2] mb-4">
          To view your mnemonic backup, you need to authenticate with your
          password or biometrics.
        </p>
      </div>

      {/* Security Warnings */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg
            className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <h4 className="text-base font-semibold text-yellow-800 mb-2">
              Important Security Notice
            </h4>
            <ul className="text-[15px] font-medium text-yellow-700 space-y-1">
              <li>• Never share this passphrase with anyone</li>
              <li>• Store it in a secure location offline</li>
              <li>• This passphrase can restore access to your account</li>
              <li>• Anyone with this passphrase can access your funds</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Authentication Method */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-base font-semibold text-black mb-3">
          Authentication Required
        </h4>

        {userProfile?.security?.webauthn?.credentialId ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <p className="text-[15px] font-medium text-[#b2b2b2] mb-4">
              Use your biometric authentication to access your mnemonic backup
            </p>
            <button
              onClick={handleAuthenticate}
              disabled={isLoading}
              className="w-full h-[54px] bg-white border border-gray-200 rounded-lg text-base font-semibold text-black hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Authenticating...' : 'Authenticate with Biometrics'}
            </button>
          </div>
        ) : (
          <div>
            <label className="block text-base font-semibold text-black mb-2">
              Enter your password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-[15px] font-medium mb-4"
              placeholder="Enter your password"
            />
            <button
              onClick={handleAuthenticate}
              disabled={isLoading || !password.trim()}
              className="w-full h-[54px] bg-white border border-gray-200 rounded-lg text-base font-semibold text-black hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Authenticating...' : 'Authenticate with Password'}
            </button>
          </div>
        )}
      </div>

      {/* Error display */}
      {(error || passwordError) && (
        <div className="text-[15px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error || passwordError}
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full h-[54px] bg-gray-100 rounded-lg text-base font-semibold text-black hover:bg-gray-200 transition-colors"
      >
        Back
      </button>
    </div>
  );

  const renderDisplayStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-black mb-2">
          Your Mnemonic Backup
        </h3>
        <p className="text-[15px] font-medium text-[#b2b2b2] mb-4">
          Write down this passphrase and store it in a safe place. You'll need
          it to restore your account.
        </p>
      </div>

      {/* Mnemonic Display */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-base font-semibold text-black">
            24-Word Mnemonic
          </h4>
          <button
            onClick={copyMnemonic}
            className="text-[15px] font-medium text-[#b2b2b2] hover:text-black transition-colors flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Copy
          </button>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-[15px] font-mono text-black break-all leading-relaxed">
            {backupInfo?.mnemonic || 'Loading...'}
          </p>
        </div>
      </div>

      {/* Security Warnings */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg
            className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <h4 className="text-base font-semibold text-yellow-800 mb-2">
              Important Security Notice
            </h4>
            <ul className="text-[15px] font-medium text-yellow-700 space-y-1">
              <li>• Never share this passphrase with anyone</li>
              <li>• Store it in a secure location offline</li>
              <li>• This passphrase can restore access to your account</li>
              <li>• Anyone with this passphrase can access your funds</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={onBack}
        className="w-full h-[54px] bg-gray-100 rounded-lg text-base font-semibold text-black hover:bg-gray-200 transition-colors"
      >
        Done
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#efefef]">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
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
            <h1 className="text-2xl font-semibold text-black">
              Passphrase Backup
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-20">
          {step === 'auth' && renderAuthStep()}
          {step === 'display' && renderDisplayStep()}
        </div>
      </div>
    </div>
  );
};

export default MnemonicBackup;
