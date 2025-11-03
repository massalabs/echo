import React, { useState } from 'react';
import BaseModal from '../components/ui/BaseModal';
import { useAccountStore } from '../stores/accountStore';
import { formatMassaAddress } from '../utils/addressUtils';
import appLogo from '../assets/echo_face.svg';
import AccountBackup from '../components/account/AccountBackup';
import ShareContact from '../components/settings/ShareContact';

enum SettingsView {
  SHOW_ACCOUNT_BACKUP = 'SHOW_ACCOUNT_BACKUP',
  SHARE_CONTACT = 'SHARE_CONTACT',
}

const Settings = (): React.ReactElement => {
  const {
    userProfile,
    account,
    hasMnemonicBackup,
    getMnemonicBackupInfo,
    resetAccount,
  } = useAccountStore();
  const [activeView, setActiveView] = useState<SettingsView | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const handleCopyAddress = async () => {
    if (!account?.address) return;

    try {
      await navigator.clipboard.writeText(account.address.toString());
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const handleResetAccount = async () => {
    setIsResetModalOpen(true);
  };

  const mnemonicBackupInfo = getMnemonicBackupInfo();
  const hasMnemonic = hasMnemonicBackup();

  // Show sub-views based on activeView
  switch (activeView) {
    case SettingsView.SHOW_ACCOUNT_BACKUP:
      return <AccountBackup onBack={() => setActiveView(null)} />;
    case SettingsView.SHARE_CONTACT:
      return <ShareContact onBack={() => setActiveView(null)} />;
    default:
      break;
  }

  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="px-6 py-4">
          <h1 className="text-2xl font-semibold text-black dark:text-white">
            SETTINGS
          </h1>
        </div>

        {/* Account Profile Section */}
        <div className="px-4 mb-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 relative">
            <div className="flex items-start gap-4">
              <img
                src={appLogo}
                className="w-[74px] h-[74px] rounded-tl-lg object-cover"
                alt="Profile"
              />
              <div className="flex-1">
                <h3 className="text-base font-bold text-black dark:text-white mb-1">
                  {userProfile?.username || 'Account name'}
                </h3>
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-medium text-[#b2b2b2] dark:text-gray-400">
                    {account?.address
                      ? formatMassaAddress(account.address.toString())
                      : 'AU121243124312431243'}
                  </p>
                  <button
                    onClick={handleCopyAddress}
                    className="p-1 text-[#b2b2b2] dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
              <span className="text-base font-semibold text-black dark:text-white">
                Account settings
              </span>
              <svg
                className="w-6 h-6 text-black dark:text-white"
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
            <div className="mt-4 h-px bg-gray-300 dark:bg-gray-600"></div>
          </div>
        </div>

        {/* Settings Options */}
        <div className="px-4 space-y-2">
          {/* Account Backup Button */}
          <button
            onClick={() => setActiveView(SettingsView.SHOW_ACCOUNT_BACKUP)}
            className="w-full bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg
              className="w-5 h-5 text-black dark:text-white mr-4"
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
            <span className="text-base font-semibold text-black dark:text-white">
              Account Backup
            </span>
            {hasMnemonic && mnemonicBackupInfo?.backedUp && (
              <div className="ml-auto w-2 h-2 bg-green-500 rounded-full"></div>
            )}
          </button>

          {/* Share Contact Button */}
          <button
            onClick={() => setActiveView(SettingsView.SHARE_CONTACT)}
            className="w-full bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg
              className="w-5 h-5 text-black dark:text-white mr-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 8a3 3 0 11-6 0 3 3 0 016 0zm-9 9a6 6 0 1112 0H6z"
              />
            </svg>
            <span className="text-base font-semibold text-black dark:text-white">
              Share Contact
            </span>
          </button>

          {/* Additional Settings Buttons */}
          <button className="w-full bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <svg
              className="w-5 h-5 text-black dark:text-white mr-4"
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
            <span className="text-base font-semibold text-black dark:text-white">
              Security
            </span>
          </button>

          <button className="w-full bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <svg
              className="w-5 h-5 text-black dark:text-white mr-4"
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
            <span className="text-base font-semibold text-black dark:text-white">
              Notifications
            </span>
          </button>

          <button className="w-full bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <svg
              className="w-5 h-5 text-black dark:text-white mr-4"
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
            <span className="text-base font-semibold text-black dark:text-white">
              Privacy
            </span>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleResetAccount}
            className="w-full bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg
              className="w-5 h-5 text-red-500 dark:text-red-400 mr-4"
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
            <span className="text-base font-semibold text-red-500 dark:text-red-400">
              Logout
            </span>
          </button>
        </div>
      </div>
      <BaseModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset account?"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            This will delete all your data and cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                setIsResetModalOpen(false);
                try {
                  await resetAccount();
                } catch (error) {
                  console.error('Failed to reset account:', error);
                }
              }}
              className="flex-1 h-11 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              Reset
            </button>
            <button
              onClick={() => setIsResetModalOpen(false)}
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

export default Settings;
