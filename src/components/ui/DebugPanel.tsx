import React, { useCallback } from 'react';
import { db } from '../../db';
import { useAccountStore } from '../../stores/accountStore';
import { announcementService } from '../../services/announcement';
import { formatMassaAddress } from '../../utils/addressUtils';
import Button from './Button';
import { triggerManualSync } from '../../services/messageSync';

const DebugPanel: React.FC = () => {
  const { userProfile, account, resetAccount } = useAccountStore();

  const handleResetAccount = useCallback(async () => {
    try {
      await resetAccount();
    } catch (error) {
      console.error('Failed to reset account:', error);
    }
  }, [resetAccount]);

  const handleResetAllDiscussionsAndMessages = useCallback(async () => {
    try {
      await db.transaction(
        'rw',
        [db.contacts, db.messages, db.discussions],
        async () => {
          await db.messages.clear();
          await db.discussions.clear();
          await db.contacts.clear();
        }
      );
    } catch (error) {
      console.error('Failed to reset discussions and messages:', error);
    } finally {
      await triggerManualSync();
    }
  }, []);

  const handleResetAllAccounts = useCallback(async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();

      db.close();
      await db.delete();
      try {
        await db.delete();
      } catch (_e) {
        console.debug('DB already deleted');
      }

      try {
        const databases = await indexedDB.databases();
        for (const database of databases) {
          if (database.name?.includes('GossipDatabase')) {
            indexedDB.deleteDatabase(database.name);
          }
        }
      } catch (_e) {
        console.log('Could not enumerate databases');
      }

      await resetAccount();
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset all accounts:', error);
      window.location.reload();
    }
  }, [resetAccount]);

  const handleSimulateIncomingDiscussion = useCallback(async () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      const result = await announcementService.simulateIncomingDiscussion();
      if (result.success) {
        console.log(
          'Simulated incoming discussion. New messages:',
          result.newMessagesCount
        );
      } else {
        console.error('Simulation failed:', result.error);
      }
    } catch (error) {
      console.error('Failed to simulate incoming discussion:', error);
    }
  }, []);

  return (
    <div className="mt-8 p-4 text-left">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        User: {userProfile?.username}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        Address:{' '}
        {account?.address
          ? formatMassaAddress(account.address.toString())
          : 'N/A'}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Status: {userProfile?.status}
      </p>
      <Button
        onClick={handleResetAccount}
        variant="link"
        size="custom"
        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
      >
        Reset Account (for testing)
      </Button>
      <br />
      <Button
        onClick={handleResetAllAccounts}
        variant="link"
        size="custom"
        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
      >
        Reset All Accounts (wipe local storage)
      </Button>
      <br />
      <Button
        onClick={handleResetAllDiscussionsAndMessages}
        variant="link"
        size="custom"
        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
      >
        Reset Discussions, Messages & Contacts (DB only)
      </Button>
      <br />
      <Button
        onClick={handleSimulateIncomingDiscussion}
        variant="link"
        size="custom"
        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
      >
        Simulate Incoming Discussion (test)
      </Button>
    </div>
  );
};

export default DebugPanel;
