import React from 'react';
import appLogo from '../../assets/echo_face.svg';

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  showLogo?: boolean;
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  onBack,
  showLogo = false,
  className = '',
}) => {
  return (
    <div className={`px-6 py-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-600 dark:text-gray-300"
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
          )}
          {showLogo && (
            <img
              src={appLogo}
              className="w-9 h-9 rounded object-cover"
              alt="Echo logo"
            />
          )}
          <h1 className="text-xl font-semibold text-black dark:text-white">
            {title}
          </h1>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
