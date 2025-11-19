import React from 'react';
import Button from '../ui/Button';
import appLogo from '../../assets/gossip_face.svg';

interface NewContactHeaderProps {
  onBack: () => void;
}

const NewContactHeader: React.FC<NewContactHeaderProps> = ({ onBack }) => {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            onClick={onBack}
            variant="circular"
            size="custom"
            className="w-10 h-10 flex items-center justify-center"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Button>
          <img
            src={appLogo}
            className="w-6 h-6 rounded object-cover"
            alt="Gossip logo"
          />
          <h1 className="text-xl font-semibold">New contact</h1>
        </div>
      </div>
    </div>
  );
};

export default NewContactHeader;
