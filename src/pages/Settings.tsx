import React, { useState } from 'react';
import BaseModal from '../components/ui/BaseModal';
import PageHeader from '../components/ui/PageHeader';
import { useAccountStore } from '../stores/accountStore';
import { useAppStore } from '../stores/appStore';
import { useTheme } from '../components/ui/use-theme';
import { formatUserId } from '../utils/userId';
import appLogo from '../assets/gossip_face.svg';
import AccountBackup from '../components/account/AccountBackup';
import ShareContact from '../components/settings/ShareContact';
import Button from '../components/ui/Button';
import CopyClipboard from '../components/ui/CopyClipboard';

enum SettingsView {
  SHOW_ACCOUNT_BACKUP = 'SHOW_ACCOUNT_BACKUP',
  SHARE_CONTACT = 'SHARE_CONTACT',
}

const Settings = (): React.ReactElement => {
  const { userProfile, getMnemonicBackupInfo, logout, resetAccount } =
    useAccountStore();
  const { showDebugPanel, setShowDebugPanel } = useAppStore();
  const { setTheme, resolvedTheme } = useTheme();
  const [activeView, setActiveView] = useState<SettingsView | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

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
    <div className="max-w-md mx-auto bg-card h-full overflow-scroll">
      <div className="h-full">
        {/* Header */}
        <div className="max-w-md m-auto border-b border-border fixed top-0 left-0 right-0 z-50 bg-card">
          <PageHeader title="Settings" />
        </div>
        {/* Account Profile Section */}
        <div className="px-4 mt-20">
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
                {userProfile?.userId && (
                  <div className="mb-2 flex items-baseline gap-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                      User ID:
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 truncate">
                        {formatUserId(userProfile.userId, 5, 3)}
                      </p>
                      <CopyClipboard
                        text={userProfile.userId}
                        title="Copy user ID"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Settings Options */}
        <div className="px-4 pb-24 space-y-2">
          {/* App Version */}
          <div className="bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4 justify-between">
            <span className="text-base font-semibold text-black dark:text-white">
              Version
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              0.0.1
            </span>
          </div>

          {/* Account Backup Button */}
          <Button
            variant="outline"
            size="custom"
            className="w-full h-[54px] flex items-center px-4 justify-start rounded-lg"
            onClick={() => setActiveView(SettingsView.SHOW_ACCOUNT_BACKUP)}
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span className="text-base font-semibold flex-1 text-left">
              Account Backup
            </span>
            {mnemonicBackupInfo?.backedUp && (
              <div className="w-2 h-2 bg-success rounded-full ml-auto"></div>
            )}
          </Button>

          {/* Share Contact Button */}
          <Button
            variant="outline"
            size="custom"
            className="w-full h-[54px] flex items-center px-4 justify-start rounded-lg"
            onClick={() => setActiveView(SettingsView.SHARE_CONTACT)}
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 8a3 3 0 11-6 0 3 3 0 016 0zm-9 9a6 6 0 1112 0H6z"
              />
            </svg>
            <span className="text-base font-semibold flex-1 text-left">
              Share Contact
            </span>
          </Button>

          {/* Security Button */}
          <Button
            variant="outline"
            size="custom"
            className="w-full h-[54px] flex items-center px-4 justify-start rounded-lg"
            onClick={() => {}}
            disabled
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span className="text-base font-semibold flex-1 text-left">
              Security
            </span>
          </Button>

          {/* Notifications Button */}
          <Button
            variant="outline"
            size="custom"
            className="w-full h-[54px] flex items-center px-4 justify-start rounded-lg"
            onClick={() => {}}
            disabled
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <span className="text-base font-semibold flex-1 text-left">
              Notifications
            </span>
          </Button>

          {/* Privacy Button */}
          <Button
            variant="outline"
            size="custom"
            className="w-full h-[54px] flex items-center px-4 justify-start rounded-lg"
            onClick={() => {}}
            disabled
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span className="text-base font-semibold flex-1 text-left">
              Privacy
            </span>
          </Button>

          {/* Theme Toggle */}
          <div className="bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4">
            {resolvedTheme === 'dark' ? (
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="w-5 h-5 text-black dark:text-white mr-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            ) : (
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="w-5 h-5 text-black dark:text-white mr-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            )}
            <span className="text-base font-semibold text-black dark:text-white flex-1 text-left">
              {resolvedTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </span>
            <button
              onClick={() => {
                setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                resolvedTheme === 'dark'
                  ? 'bg-primary'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
              role="switch"
              aria-checked={resolvedTheme === 'dark'}
              aria-label="Toggle theme"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  resolvedTheme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Debug Panel Toggle */}
          <div className="bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5 text-black dark:text-white mr-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            <span className="text-base font-semibold text-black dark:text-white flex-1 text-left">
              Show Debug Panel
            </span>
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                showDebugPanel ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
              }`}
              role="switch"
              aria-checked={showDebugPanel}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showDebugPanel ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Logout Button */}
          <Button
            variant="outline"
            size="custom"
            className="w-full h-[54px] flex items-center px-4 justify-start rounded-lg text-foreground border-border hover:bg-muted"
            onClick={handleLogout}
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className="text-base font-semibold flex-1 text-left">
              Logout
            </span>
          </Button>

          {/* Reset Account Button */}
          <Button
            variant="outline"
            size="custom"
            className="w-full h-[54px] flex items-center px-4 justify-start rounded-lg text-red-500 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={handleResetAccount}
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span className="text-base font-semibold flex-1 text-left">
              Reset Account
            </span>
          </Button>
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
