import React from 'react';
import { PrivacyGraphic } from '../ui/PrivacyGraphic';

const EmptyDiscussions: React.FC = () => {
  return (
    <div className="py-8 text-center">
      <div className="mb-6 flex justify-center">
        <PrivacyGraphic size={200} />
      </div>
      <p className="text-sm text-muted-foreground mb-4">No discussions yet</p>
      <p className="text-xs text-muted-foreground">
        Start a discussion by tapping the compose button
      </p>
    </div>
  );
};

export default EmptyDiscussions;
