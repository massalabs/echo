import React, { useState } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { formatMassaAddress } from '../utils/addressUtils';
import appLogo from '../assets/echo_face.svg';
import BottomNavigation from './BottomNavigation';
import { Bip39BackupDisplay } from '../crypto/bip39';

interface SettingsProps {
  onTabChange: (tab: 'wallet' | 'discussions' | 'settings') => void;
}

const Settings: React.FC<SettingsProps> = ({ onTabChange }) => {
  const {
    userProfile,
    showBip39Backup,
    markBip39BackupComplete,
    hasBip39Backup,
    getBip39BackupInfo,
    resetAccount,
  } = useAccountStore();
  const [showBip39Modal, setShowBip39Modal] = useState(false);
  const [bip39Data, setBip39Data] = useState<Bip39BackupDisplay | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleShowBip39Backup = async () => {
    try {
      setIsLoading(true);
      setPasswordError('');

      // For biometric accounts, we don't need a password
      if (userProfile?.security?.webauthn?.credentialId) {
        const backupData = await showBip39Backup();
        setBip39Data(backupData);
        setShowBip39Modal(true);
      } else {
        // For password accounts, we need the password
        if (!password.trim()) {
          setPasswordError('Password is required');
          return;
        }

        const backupData = await showBip39Backup(password);
        setBip39Data(backupData);
        setShowBip39Modal(true);
        setPassword('');
      }
    } catch (error) {
      console.error('Error showing BIP39 backup:', error);
      setPasswordError('Failed to decrypt backup. Please check your password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkBackupComplete = async () => {
    try {
      await markBip39BackupComplete();
      setShowBip39Modal(false);
      setBip39Data(null);
    } catch (error) {
      console.error('Error marking backup as complete:', error);
    }
  };

  const copyMnemonic = async () => {
    if (!bip39Data?.mnemonic) return;

    try {
      await navigator.clipboard.writeText(bip39Data.mnemonic);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy mnemonic:', error);
    }
  };

  const handleCopyAddress = async () => {
    if (!userProfile?.wallet?.address) return;

    try {
      await navigator.clipboard.writeText(userProfile.wallet.address);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const handleResetAccount = async () => {
    if (
      window.confirm(
        'Are you sure you want to reset your account? This will delete all your data and cannot be undone.'
      )
    ) {
      try {
        await resetAccount();
      } catch (error) {
        console.error('Failed to reset account:', error);
      }
    }
  };

  const backupInfo = getBip39BackupInfo();
  const hasBackup = hasBip39Backup();

  return (
    <div className="min-h-screen bg-[#efefef]">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="px-6 py-4">
          <h1 className="text-2xl font-semibold text-black">SETTINGS</h1>
        </div>

        {/* Account Profile Section */}
        <div className="px-4 mb-4">
          <div className="bg-white rounded-lg p-4 relative">
            <div className="flex items-start gap-4">
              <img
                src={appLogo}
                className="w-[74px] h-[74px] rounded-tl-lg object-cover"
                alt="Profile"
              />
              <div className="flex-1">
                <h3 className="text-base font-bold text-black mb-1">
                  {userProfile?.displayName || 'Account name'}
                </h3>
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-medium text-[#b2b2b2]">
                    {userProfile?.wallet?.address
                      ? formatMassaAddress(userProfile.wallet.address)
                      : 'AU121243124312431243'}
                  </p>
                  <button
                    onClick={handleCopyAddress}
                    className="p-1 text-[#b2b2b2] hover:text-gray-600 transition-colors"
                    title={copySuccess ? 'Copied!' : 'Copy full address'}
                  >
                    <svg
                      className="w-3 h-3"
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
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-base font-semibold text-black">
                Account settings
              </span>
              <svg
                className="w-6 h-6 text-black"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
            <div className="mt-4 h-px bg-gray-300"></div>
          </div>
        </div>

        {/* Settings Options */}
        <div className="px-4 space-y-2">
          {/* Recovery Phrase Button */}
          <button
            onClick={handleShowBip39Backup}
            disabled={!hasBackup || isLoading}
            className="w-full bg-white rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-5 h-5 text-black mr-4"
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
            <span className="text-base font-semibold text-black">
              {isLoading ? 'Loading...' : 'Recovery Phrase'}
            </span>
          </button>

          {/* Additional Settings Buttons */}
          <button className="w-full bg-white rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 transition-colors">
            <svg
              className="w-5 h-5 text-black mr-4"
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
            <span className="text-base font-semibold text-black">Security</span>
          </button>

          <button className="w-full bg-white rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 transition-colors">
            <svg
              className="w-5 h-5 text-black mr-4"
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
            <span className="text-base font-semibold text-black">
              Notifications
            </span>
          </button>

          <button className="w-full bg-white rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 transition-colors">
            <svg
              className="w-5 h-5 text-black mr-4"
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
            <span className="text-base font-semibold text-black">Privacy</span>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleResetAccount}
            className="w-full bg-white rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 transition-colors"
          >
            <svg
              className="w-5 h-5 text-red-500 mr-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className="text-base font-semibold text-red-500">Logout</span>
          </button>
        </div>

        {/* Bottom Navigation */}
        <BottomNavigation activeTab="settings" onTabChange={onTabChange} />
      </div>

      {/* BIP39 Backup Modal */}
      {showBip39Modal && bip39Data && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Recovery Phrase
                </h3>
                <button
                  onClick={() => setShowBip39Modal(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  Write down these words in the exact order shown. Store them in
                  a safe place.
                </p>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-mono text-gray-900 break-words">
                    {bip39Data.mnemonic}
                  </p>
                </div>
                <button
                  onClick={copyMnemonic}
                  className="mt-2 px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  {copySuccess ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Account Address:</p>
                <p className="text-sm font-mono text-gray-900 break-all">
                  {bip39Data.account?.address?.toString()}
                </p>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Created:</p>
                <p className="text-sm text-gray-900">
                  {new Date(bip39Data.createdAt).toLocaleString()}
                </p>
              </div>

              {!backupInfo?.backedUp && (
                <div className="flex gap-2">
                  <button
                    onClick={handleMarkBackupComplete}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
                  >
                    I've Backed This Up
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Password Modal for BIP39 Backup */}
      {!userProfile?.security?.webauthn?.credentialId &&
        showBip39Modal &&
        !bip39Data && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-sm w-full">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Enter Password
                </h3>
              </div>

              <div className="p-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your password"
                  />
                  {passwordError && (
                    <p className="mt-1 text-sm text-red-600">{passwordError}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBip39Modal(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleShowBip39Backup}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? 'Loading...' : 'View Backup'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default Settings;
