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

  // Close popover when clicking outside or touching outside (mobile support)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setShowPopover(false);
      }
    };

    if (showPopover) {
      // Support both mouse and touch events for mobile
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [showPopover]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setShowPopover(!showPopover)}
        className="w-6 h-6 flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/80 active:bg-secondary/60 text-muted-foreground transition-colors touch-manipulation"
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
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 w-64 max-w-[calc(100vw-2rem)] p-3 bg-card border border-border rounded-lg shadow-lg pointer-events-auto">
          <p className="text-sm text-foreground">{message}</p>
          {/* Arrow pointing to help button */}
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-r-4 border-r-border"></div>
          <div className="absolute left-0 top-1/2 -translate-x-0.5 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-r-4 border-r-card"></div>
        </div>
      )}
    </div>
  );
};

export default Popover;
