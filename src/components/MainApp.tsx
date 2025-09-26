import React from 'react';
import { useAccountStore } from '../stores/accountStore';

const MainApp: React.FC = () => {
  const { userProfile, resetAccount } = useAccountStore();

  const handleResetAccount = async () => {
    try {
      await resetAccount();
    } catch (error) {
      console.error('Failed to reset account:', error);
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
          <p className="text-sm text-gray-600">
            Your secure messenger is ready
          </p>
        </div>

        {/* Main content area - placeholder for now */}
        <div className="p-4">
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">💬</span>
            </div>
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
