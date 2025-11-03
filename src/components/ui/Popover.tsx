import React, { useEffect, useRef, useState } from 'react';

interface PopoverProps {
  message: string;
  ariaLabel?: string;
}

const Popover: React.FC<PopoverProps> = ({
  message,
  ariaLabel = 'Show help',
}) => {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setShowPopover(false);
      }
    };

    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showPopover]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setShowPopover(!showPopover)}
        className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors"
        aria-label={ariaLabel}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      {showPopover && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 w-64 max-w-[calc(100vw-2rem)] p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
          {/* Arrow pointing to help button */}
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-r-4 border-r-gray-200 dark:border-r-gray-700"></div>
          <div className="absolute left-0 top-1/2 -translate-x-0.5 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-r-4 border-r-white dark:border-r-gray-800"></div>
        </div>
      )}
    </div>
  );
};

export default Popover;
