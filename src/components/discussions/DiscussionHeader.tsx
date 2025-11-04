import React from 'react';

interface DiscussionHeaderProps {
  title?: string;
}

const DiscussionHeader: React.FC<DiscussionHeaderProps> = () => {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo.svg"
            className="w-9 h-9 dark:invert"
            alt="Gossip logo"
          />
          <h1 className="text-xl font-semibold text-foreground"></h1>
        </div>
      </div>
    </div>
  );
};

export default DiscussionHeader;
