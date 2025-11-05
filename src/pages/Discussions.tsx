import React from 'react';
import DiscussionHeader from '../components/discussions/DiscussionHeader';
import DiscussionListPanel from '../components/discussions/DiscussionListPanel';
import DebugPanel from '../components/ui/DebugPanel';
import { useDiscussionList } from '../hooks/useDiscussionList';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';

const Discussions: React.FC = () => {
  const { stores, state, selectors, handlers } = useDiscussionList();
  const navigate = useNavigate();

  if (stores.isLoading || state.appState === 'loading') {
    return (
      <div className="min-h-screen-mobile bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-border border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-mobile bg-background">
      <div className="max-w-sm mx-auto h-screen-mobile flex flex-col">
        <DiscussionHeader />

        <div className="px-4 pb-20 flex-1 overflow-y-auto">
          <DiscussionListPanel
            state={state}
            selectors={selectors}
            onRefresh={handlers.handleRefresh}
            onSelect={id => {
              // Delegate selection to existing handler if it accepts shallow object
              navigate(`/discussion/${id}`);
            }}
            headerVariant="link"
          />
          <DebugPanel />
        </div>

        <Button
          onClick={() => navigate('/new-discussion')}
          variant="primary"
          size="custom"
          className="fixed bottom-24 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
        >
          <svg
            className="w-6 h-6 text-primary-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </Button>
      </div>
    </div>
  );
};

export default Discussions;
