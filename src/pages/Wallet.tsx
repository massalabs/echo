import React, { useCallback, useState } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { useWalletStore } from '../stores/walletStore';
import BottomNavigation from '../components/BottomNavigation';
import SendModal from '../components/wallet/SendModal';
import ReceiveModal from '../components/wallet/ReceiveModal';
import sendIcon from '../assets/icons/send.svg';
import receiveIcon from '../assets/icons/receive.svg';
import swapIcon from '../assets/icons/swap.svg';
import { formatMassaAddress } from '../utils/addressUtils';
import { formatAmount } from '../hooks/temp/parseAmount';

interface WalletProps {
  onTabChange: (tab: 'wallet' | 'discussions' | 'settings') => void;
}

const Wallet: React.FC<WalletProps> = ({ onTabChange }) => {
  const { userProfile } = useAccountStore();
  const tokens = useWalletStore.use.tokens();
  const isLoading = useWalletStore.use.isLoading();
  const refreshBalances = useWalletStore.use.refreshBalances();
  const totalValueUsd = tokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshBalances();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshBalances]);

  const handleSendSuccess = useCallback(() => {
    setIsSendModalOpen(false);
  }, []);

  const fullAddress = userProfile?.wallet?.address ?? '';
  const displayAddress = formatMassaAddress(fullAddress);

  return (
    <div className="min-h-screen-mobile bg-white dark:bg-gray-900">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-black dark:text-white">
            WALLET
          </h1>
          <button
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
            title="Refresh balance and prices"
          >
            <svg
              className={`w-5 h-5 text-gray-600 dark:text-gray-300 ${isRefreshing ? '-animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* Address */}
        {fullAddress && (
          <div className="px-6 -mt-2">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
              <span className="uppercase tracking-wide">Address</span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(fullAddress)}
                className="font-mono px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer active:bg-gray-300 dark:active:bg-gray-700"
                title="Copy address"
              >
                {displayAddress}
              </button>
            </div>
          </div>
        )}

        {/* Total Balance */}
        <div className="px-6 py-4 text-center">
          <div className="text-4xl font-semibold text-black dark:text-white">
            {isLoading ? 'Loading...' : `$${totalValueUsd.toFixed(2)}`}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4">
          <div className="flex justify-center gap-6">
            {/* Send Button */}
            <button
              onClick={() => setIsSendModalOpen(true)}
              className="flex flex-col items-center hover:opacity-80 transition-opacity"
            >
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-2">
                <img src={sendIcon} alt="Send" />
              </div>
              <span className="text-xs font-medium text-black dark:text-white">
                send
              </span>
            </button>

            {/* Receive Button */}
            <button
              onClick={() => setIsReceiveModalOpen(true)}
              className="flex flex-col items-center hover:opacity-80 transition-opacity"
            >
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-2">
                <img src={receiveIcon} alt="Receive" />
              </div>
              <span className="text-xs font-medium text-black dark:text-white">
                receive
              </span>
            </button>

            {/* Swap Button */}
            <button
              onClick={() =>
                alert('Swap functionality will be implemented soon!')
              }
              className="flex flex-col items-center hover:opacity-80 transition-opacity"
            >
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-2">
                <img src={swapIcon} alt="Swap" />
              </div>
              <span className="text-xs font-medium text-black dark:text-white">
                swap
              </span>
            </button>
          </div>
        </div>

        {/* Token List */}
        <div className="px-6 pb-20">
          <div className="space-y-0">
            {tokens.map((token, index) => (
              <div key={index}>
                <div className="flex items-center py-4">
                  {/* Token Icon */}
                  <div className="mr-4">
                    <img
                      src={token.icon}
                      alt={token.name}
                      className="w-11 h-11 rounded-full"
                    />
                  </div>

                  {/* Token Info */}
                  <div className="flex-1">
                    <div className="text-base font-bold text-black dark:text-white">
                      {token.name}
                    </div>
                    <div className="text-sm font-medium text-[#b2b2b2] dark:text-gray-400">
                      {isLoading
                        ? 'Loading...'
                        : `${formatAmount(token.balance ?? 0n, token.decimals).preview} ${token.ticker}`}
                    </div>
                  </div>

                  {/* Token Value */}
                  <div className="text-sm font-semibold text-black dark:text-white">
                    {isLoading
                      ? 'Loading...'
                      : token.valueUsd != null
                        ? `$${token.valueUsd.toFixed(2)}`
                        : 'N/A'}
                  </div>
                </div>

                {/* Separator Line */}
                {index < tokens.length - 1 && (
                  <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Navigation */}
        <BottomNavigation activeTab="wallet" onTabChange={onTabChange} />
      </div>

      {/* Send Modal */}
      <SendModal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        onSuccess={handleSendSuccess}
      />

      {/* Receive Modal */}
      <ReceiveModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
      />
    </div>
  );
};

export default Wallet;
