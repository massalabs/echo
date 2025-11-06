import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { useDiscussionStore } from '../stores/discussionStore';
// Removed desktop sidebar imports
import DiscussionContent from '../components/discussions/DiscussionContent';

const Discussion: React.FC = () => {
  const { userId } = useParams();
  useNavigate();
  const getContactByUserId = useDiscussionStore(s => s.getContactByUserId);

  const contact = userId ? getContactByUserId(userId) : undefined;

  // Mobile-first: show only discussion page when selected
  return (
    <div className="h-screen-mobile md:h-screen bg-background flex">
      <div className="flex-1 flex flex-col min-w-0">
        {contact ? <DiscussionContent contact={contact} /> : null}
      </div>
    </div>
  );
};

export default Discussion;
