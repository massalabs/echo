import React, { useState } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { formatMassaAddress } from '../utils/addressUtils';
import appLogo from '../assets/echo_face.svg';

const MainApp: React.FC = () => {
  const { userProfile, resetAccount } = useAccountStore();
  const [copySuccess, setCopySuccess] = useState(false);

  const handleResetAccount = async () => {
    try {
      await resetAccount();
    } catch (error) {
      console.error('Failed to reset account:', error);
    }
  };

  const handleCopyAddress = async () => {
    if (!userProfile?.wallet?.address) return;

    try {
      await navigator.clipboard.writeText(userProfile.wallet.address);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000); // Reset after 2 seconds
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-black">
            Welcome back, {userProfile?.username}!
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500 font-mono">
              {userProfile?.wallet?.address
                ? formatMassaAddress(userProfile.wallet.address)
                : ''}
            </p>
            {userProfile?.wallet?.address && (
              <button
                onClick={handleCopyAddress}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title={copySuccess ? 'Copied!' : 'Copy full address'}
              >
                {copySuccess ? (
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
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
                )}
              </button>
            )}
          </div>
          <p className="text-sm text-gray-600">
            Your secure messenger is ready
          </p>
        </div>

        {/* Main content area - placeholder for now */}
        <div className="p-4">
          <div className="text-center py-12">
            <img
              src={appLogo}
              className="w-16 h-16 mx-auto mb-4 rounded-full object-cover"
              alt="Echo logo"
            />
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              Main App Coming Soon
            </h2>
            <p className="text-sm text-gray-600">
              This is where your conversations and features will be
            </p>

            {/* Debug info and reset button */}
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-2">
                User Profile ID: {userProfile?.id}
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Status: {userProfile?.status}
              </p>
              <button
                onClick={handleResetAccount}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                Reset Account (for testing)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainApp;
