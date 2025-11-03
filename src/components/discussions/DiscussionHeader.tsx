import React from 'react';
import appLogo from '../../assets/echo_face.svg';

interface DiscussionHeaderProps {
  title?: string;
}

const DiscussionHeader: React.FC<DiscussionHeaderProps> = ({
  title = 'Discussions',
}) => {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={appLogo}
            className="w-9 h-9 rounded object-cover"
            alt="Echo logo"
          />
          <h1 className="text-xl font-semibold text-black dark:text-white">
            {title}
          </h1>
        </div>
      </div>
    </div>
  );
};

export default DiscussionHeader;
