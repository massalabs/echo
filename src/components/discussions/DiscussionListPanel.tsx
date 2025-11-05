import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiscussionList } from '../../hooks/useDiscussionList';
import EmptyDiscussions from './EmptyDiscussions';
import DiscussionListItem from './DiscussionListItem';

interface DiscussionListPanelProps {
  state: ReturnType<typeof useDiscussionList>['state'];
  selectors: ReturnType<typeof useDiscussionList>['selectors'];
  onRefresh: () => void;
  onSelect: (contactUserId: string) => void;
  activeUserId?: string;
  headerVariant?: 'button' | 'link';
}

const DiscussionListPanel: React.FC<DiscussionListPanelProps> = ({
  state,
  selectors,
  onRefresh,
  onSelect,
  activeUserId,
  headerVariant = 'button',
}) => {
  const navigate = useNavigate();

  const {
    handlers: { handleAcceptDiscussionRequest },
  } = useDiscussionList();

  return (
    <div className="bg-card rounded-lg">
      <div className="px-6 py-4 border-b border-border flex justify-between items-center">
        <h2 className="text-lg font-medium text-foreground">Discussions</h2>
        {headerVariant === 'link' ? (
          <button
            onClick={onRefresh}
            className="text-xs text-primary hover:text-primary/80 underline"
          >
            Refresh
          </button>
        ) : (
          <button
            onClick={onRefresh}
            className="text-xs text-primary hover:text-primary/80 underline"
          >
            Refresh
          </button>
        )}
      </div>

      <div className="divide-y divide-border">
        {!state.areDiscussionsLoaded ? null : state.discussions.filter(
            d => d.status !== 'closed'
          ).length === 0 ? (
          <EmptyDiscussions />
        ) : (
          state.discussions
            .filter(d => d.status !== 'closed')
            .map(discussion => {
              const contact = selectors.getContactByUserId(
                discussion.contactUserId
              );
              if (!contact) return null;
              const lastMessage = state.lastMessages.get(
                discussion.contactUserId
              );

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
                    onRefuse={() => {}}
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
