import React, { useState } from 'react';
import BaseModal from '../components/ui/BaseModal';
import PageHeader from '../components/ui/PageHeader';
import SettingsButton from '../components/ui/SettingsButton';
import { useAccountStore } from '../stores/accountStore';
import { formatMassaAddress } from '../utils/addressUtils';
import appLogo from '../assets/echo_face.svg';
import AccountBackup from '../components/account/AccountBackup';
import ShareContact from '../components/settings/ShareContact';
import Button from '../components/ui/Button';
import CopyClipboard from '../components/ui/CopyClipboard';

enum SettingsView {
  SHOW_ACCOUNT_BACKUP = 'SHOW_ACCOUNT_BACKUP',
  SHARE_CONTACT = 'SHARE_CONTACT',
}

const Settings = (): React.ReactElement => {
  const { userProfile, account, getMnemonicBackupInfo, resetAccount } =
    useAccountStore();
  const [activeView, setActiveView] = useState<SettingsView | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const handleResetAccount = async () => {
    setIsResetModalOpen(true);
  };

  const mnemonicBackupInfo = getMnemonicBackupInfo();

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
        <PageHeader title="Settings" showLogo />

        {/* Account Profile Section */}
        <div className="px-4 mb-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
            <div className="flex items-start gap-4 mb-4">
              <img
                src={appLogo}
                className="w-16 h-16 rounded-lg object-cover"
                alt="Profile"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-black dark:text-white mb-2">
                  {userProfile?.username || 'Account name'}
                </h3>
                {account?.address && (
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 truncate">
                      {formatMassaAddress(account.address.toString())}
                    </p>
                    <CopyClipboard
                      text={account.address.toString()}
                      title="Copy address"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Settings Options */}
        <div className="px-4 pb-20 space-y-2">
          {/* Account Backup Button */}
          <SettingsButton
            icon={
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            }
            label="Account Backup"
            onClick={() => setActiveView(SettingsView.SHOW_ACCOUNT_BACKUP)}
            badge={
              mnemonicBackupInfo?.backedUp ? (
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              ) : undefined
            }
          />

          {/* Share Contact Button */}
          <SettingsButton
            icon={
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 8a3 3 0 11-6 0 3 3 0 016 0zm-9 9a6 6 0 1112 0H6z"
                />
              </svg>
            }
            label="Share Contact"
            onClick={() => setActiveView(SettingsView.SHARE_CONTACT)}
          />

          {/* Security Button */}
          <SettingsButton
            icon={
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            }
            label="Security"
            onClick={() => {}}
            disabled
          />

          {/* Notifications Button */}
          <SettingsButton
            icon={
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            }
            label="Notifications"
            onClick={() => {}}
            disabled
          />

          {/* Privacy Button */}
          <SettingsButton
            icon={
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            }
            label="Privacy"
            onClick={() => {}}
            disabled
          />

          {/* Logout Button */}
          <SettingsButton
            icon={
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            }
            label="Logout"
            onClick={handleResetAccount}
            variant="danger"
          />
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
            <Button
              onClick={async () => {
                setIsResetModalOpen(false);
                try {
                  await resetAccount();
                } catch (error) {
                  console.error('Failed to reset account:', error);
                }
              }}
              variant="danger"
              size="custom"
              className="flex-1 h-11 rounded-lg font-semibold"
            >
              Reset
            </Button>
            <Button
              onClick={() => setIsResetModalOpen(false)}
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

export default Settings;
