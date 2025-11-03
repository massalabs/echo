import React, { useState } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { useFileShareContact } from '../../hooks/useFileShareContact';

interface ShareContactProps {
  onBack: () => void;
}

type ShareTab = 'files' | 'qr';

const ShareContact: React.FC<ShareContactProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<ShareTab>('files');
  const { ourPk, userProfile } = useAccountStore();
  const { exportFileContact, isLoading, error } = useFileShareContact();

  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="text-2xl font-semibold text-black dark:text-white">
              Share Contact
            </h1>
          </div>
        </div>

        <div className="px-4 pb-20 space-y-6">
          {/* Tabs */}
          <div className="w-full p-1 bg-gray-100 dark:bg-gray-800 rounded-lg relative h-10 flex items-center">
            <div
              className={`absolute top-1 bottom-1 w-1/2 rounded-md bg-white dark:bg-gray-700 shadow transition-transform duration-200 ease-out ${
                activeTab === 'files' ? 'translate-x-0' : 'translate-x-full'
              }`}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`relative z-10 flex-1 h-8 inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'files'
                  ? 'text-black dark:text-white'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
              aria-pressed={activeTab === 'files'}
            >
              Files
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('qr')}
              className={`relative z-10 flex-1 h-8 inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'qr'
                  ? 'text-black dark:text-white'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
              aria-pressed={activeTab === 'qr'}
            >
              QR code
            </button>
          </div>

          {/* Content */}
          {activeTab === 'files' && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="text-base font-semibold text-black dark:text-white mb-2">
                Share with file
              </h4>
              <p className="text-[15px] font-medium text-[#4a4a4a] dark:text-gray-300 mb-4">
                Download your profile file and share it with people you want to
                talk to.
              </p>
              <button
                onClick={() => {
                  if (!ourPk) return;
                  exportFileContact({
                    userPubKeys: ourPk.to_bytes(),
                    userName: userProfile?.username,
                  });
                }}
                disabled={!ourPk || isLoading}
                className="w-full h-[54px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-base font-semibold text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                Download
              </button>
              {error && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="text-base font-semibold text-black dark:text-white mb-2">
                Scan QR code
              </h4>
              <div className="w-full aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <span className="text-gray-500 dark:text-gray-300 text-sm">
                  QR code placeholder
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareContact;
