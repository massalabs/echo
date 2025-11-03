import React from 'react';
import { UserProfile } from '../db';
import { formatMassaAddress } from '../utils/addressUtils';

interface DebugPanelProps {
  userProfile: UserProfile | null | undefined;
  accountAddress?: string | null;
  onResetAccount: () => void;
  onResetAllAccounts: () => void;
  onResetDiscussionsAndMessages: () => void;
  onSimulateIncomingDiscussion: () => void;
  onFetchAllAnnouncements: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({
  userProfile,
  accountAddress,
  onResetAccount,
  onResetAllAccounts,
  onResetDiscussionsAndMessages,
  onSimulateIncomingDiscussion,
  onFetchAllAnnouncements,
}) => {
  return (
    <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-left">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        User: {userProfile?.username}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        Address:{' '}
        {accountAddress ? formatMassaAddress(accountAddress.toString()) : 'N/A'}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Status: {userProfile?.status}
      </p>
      <button
        onClick={onResetAccount}
        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
      >
        Reset Account (for testing)
      </button>
      <br />
      <button
        onClick={onResetAllAccounts}
        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
      >
        Reset All Accounts (wipe local storage)
      </button>
      <br />
      <button
        onClick={onResetDiscussionsAndMessages}
        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
      >
        Reset Discussions, Messages & Contacts (DB only)
      </button>
      <br />
      <button
        onClick={onSimulateIncomingDiscussion}
        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
      >
        Simulate Incoming Discussion (test)
      </button>
      <br />
      <button
        onClick={onFetchAllAnnouncements}
        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
      >
        Fetch All Announcements (test)
      </button>
    </div>
  );
};

export default DebugPanel;
