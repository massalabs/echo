import React from 'react';

const EmptyDiscussions: React.FC = () => {
  return (
    <div className="py-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
        <svg
          className="w-8 h-8 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        No discussions yet
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Start a discussion by tapping the compose button
      </p>
    </div>
  );
};

export default EmptyDiscussions;
