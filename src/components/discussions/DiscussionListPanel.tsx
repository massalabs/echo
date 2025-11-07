import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiscussionList } from '../../hooks/useDiscussionList';
import { useDiscussionStore } from '../../stores/discussionStore';
import EmptyDiscussions from './EmptyDiscussions';
import DiscussionListItem from './DiscussionListItem';

interface DiscussionListPanelProps {
  onRefresh: () => void;
  onSelect: (contactUserId: string) => void;
  activeUserId?: string;
  headerVariant?: 'button' | 'link';
}

const DiscussionListPanel: React.FC<DiscussionListPanelProps> = ({
  onRefresh,
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

  return (
    <div className="bg-card rounded-lg">
      <div className="px-6 py-4 border-b border-border flex justify-between items-center">
        <h2 className="text-lg font-medium text-foreground">Discussions</h2>
        <button
          onClick={onRefresh}
          className="text-xs text-primary hover:text-primary/80 underline"
        >
          Refresh
        </button>
      </div>

      <div className="divide-y divide-border">
        {!areDiscussionsLoaded ? null : discussions.filter(
            d => d.status !== 'closed'
          ).length === 0 ? (
          <EmptyDiscussions />
        ) : (
          discussions
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

export default DiscussionListPanel;
