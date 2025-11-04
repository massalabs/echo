import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname || '/';
  const activeTab: 'wallet' | 'discussions' | 'settings' = path.startsWith(
    '/wallet'
  )
    ? 'wallet'
    : path.startsWith('/settings')
      ? 'settings'
      : 'discussions';
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 h-[76px] flex items-center justify-center pb-safe shadow-lg">
      <div className="flex items-center justify-center space-x-16">
        {/* Wallet Button */}
        <button
          onClick={() => navigate('/wallet')}
          className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-200 ${
            activeTab === 'wallet'
              ? 'bg-purple-100 dark:bg-purple-900/30'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              activeTab === 'wallet'
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={activeTab === 'wallet' ? 2.5 : 2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>

        {/* Discussions Button */}
        <button
          onClick={() => navigate('/')}
          className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-200 ${
            activeTab === 'discussions'
              ? 'bg-purple-100 dark:bg-purple-900/30'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              activeTab === 'discussions'
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={activeTab === 'discussions' ? 2.5 : 2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </button>

        {/* Settings Button */}
        <button
          onClick={() => navigate('/settings')}
          className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-200 ${
            activeTab === 'settings'
              ? 'bg-purple-100 dark:bg-purple-900/30'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              activeTab === 'settings'
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={activeTab === 'settings' ? 2.5 : 2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={activeTab === 'settings' ? 2.5 : 2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default BottomNavigation;
