import React, { useEffect } from 'react';
import { useAccountStore } from '../stores/accountStore';
import BottomNavigation from './BottomNavigation';
import sendIcon from '../assets/icons/send.svg';
import receiveIcon from '../assets/icons/receive.svg';
import swapIcon from '../assets/icons/swap.svg';
import masIcon from '../assets/MAS.svg';
import { Mas } from '@massalabs/massa-web3';

interface WalletProps {
  onTabChange: (tab: 'wallet' | 'discussions' | 'settings') => void;
}

const Wallet: React.FC<WalletProps> = ({ onTabChange }) => {
  const {
    provider,
    masBalance,
    isBalanceLoading,
    fetchBalance,
    refreshBalance,
  } = useAccountStore();

  // Fetch balance when component mounts
  useEffect(() => {
    if (provider && !masBalance) {
      fetchBalance();
    }
  }, [provider, masBalance, fetchBalance]);

  // MAS is the native token - always displayed
  const tokens = [
    {
      name: 'Massa',
      ticker: 'MAS',
      balance: Mas.toString(masBalance ?? 0n, 3),
      value: '$0.00', // Will be calculated from balance when price data is available
      icon: masIcon,
    },
  ];

  const totalValue = '$0.00'; // Will be calculated from all token balances when price data is available

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-black">WALLET</h1>
          <button
            onClick={refreshBalance}
            disabled={isBalanceLoading}
            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50"
            title="Refresh balance"
          >
            <svg
              className={`w-5 h-5 text-gray-600 ${isBalanceLoading ? 'animate-spin' : ''}`}
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

        {/* Total Balance */}
        <div className="px-6 py-4 text-center">
          <div className="text-4xl font-semibold text-black">{totalValue}</div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4">
          <div className="flex justify-center gap-6">
            {/* Send Button */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mb-2">
                <img src={sendIcon} alt="Send" className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium text-black">send</span>
            </div>

            {/* Receive Button */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mb-2">
                <img src={receiveIcon} alt="Receive" className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium text-black">receive</span>
            </div>

            {/* Swap Button */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mb-2">
                <img src={swapIcon} alt="Swap" className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium text-black">swap</span>
            </div>
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
                    <div className="text-base font-bold text-black">
                      {token.name}
                    </div>
                    <div className="text-sm font-medium text-[#b2b2b2]">
                      {isBalanceLoading
                        ? 'Loading...'
                        : `${token.balance} ${token.ticker}`}
                    </div>
                  </div>

                  {/* Token Value */}
                  <div className="text-sm font-semibold text-black">
                    {token.value}
                  </div>
                </div>

                {/* Separator Line */}
                {index < tokens.length - 1 && (
                  <div className="h-px bg-gray-200"></div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Navigation */}
        <BottomNavigation activeTab="wallet" onTabChange={onTabChange} />
      </div>
    </div>
  );
};

export default Wallet;
