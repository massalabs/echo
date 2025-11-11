import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiscussionList } from '../../hooks/useDiscussionList';
import { useDiscussionStore } from '../../stores/discussionStore';
import EmptyDiscussions from './EmptyDiscussions';
import DiscussionListItem from './DiscussionListItem';

interface DiscussionListProps {
  onRefresh: () => void;
  onSelect: (contactUserId: string) => void;
  activeUserId?: string;
  headerVariant?: 'button' | 'link';
}

const DiscussionList: React.FC<DiscussionListProps> = ({
  onSelect,
  activeUserId,
}) => {
  // Use the store directly instead of receiving props
  const discussions = useDiscussionStore(s => s.discussions);
  const lastMessages = useDiscussionStore(s => s.lastMessages);
  const areDiscussionsLoaded = useDiscussionStore(s => s.areDiscussionsLoaded);
  const getContactByUserId = useDiscussionStore(s => s.getContactByUserId);
  const navigate = useNavigate();

  const { handleAcceptDiscussionRequest, handleRefuseDiscussionRequest } =
    useDiscussionList();

  const d = [...discussions, ...discussions];

  return (
    <div className="bg-card rounded-lg">
      <div className="divide-y divide-border">
        {!areDiscussionsLoaded ? null : discussions.filter(
            d => d.status !== 'closed'
          ).length === 0 ? (
          <EmptyDiscussions />
        ) : (
          d
            .filter(d => d.status !== 'closed')
            .map(discussion => {
              const contact = getContactByUserId(discussion.contactUserId);
              if (!contact) return null;
              const lastMessage = lastMessages.get(discussion.contactUserId);

              const isSelected = discussion.contactUserId === activeUserId;

              return (
                <div
                  key={discussion.id}
                  className={isSelected ? 'bg-blue-50 dark:bg-blue-950/20' : ''}
                >
                  <DiscussionListItem
                    discussion={discussion}
                    contact={contact}
                    lastMessage={lastMessage}
                    onSelect={d => onSelect(d.contactUserId)}
                    onAccept={async (d, newName) => {
                      await handleAcceptDiscussionRequest(d, newName);
                      navigate(`/discussion/${d.contactUserId}`);
                    }}
                    onRefuse={() => handleRefuseDiscussionRequest(discussion)}
                  />
                </div>
              );
            })
        )}
      </div>
    </div>
  );
};

export default DiscussionList;
