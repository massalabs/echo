import React from 'react';
import DiscussionListPanel from '../components/discussions/DiscussionListPanel';
import DebugPanel from '../components/ui/DebugPanel';
import { useDiscussionList } from '../hooks/useDiscussionList';
import { useAccountStore } from '../stores/accountStore';
import { useAppStore } from '../stores/appStore';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { PrivacyGraphic } from '../components/ui/PrivacyGraphic';

const Discussions: React.FC = () => {
  const { handlers } = useDiscussionList();
  const navigate = useNavigate();
  const isLoading = useAccountStore(s => s.isLoading);
  const showDebugPanel = useAppStore(s => s.showDebugPanel);
  if (isLoading) {
    return (
      <div className="min-h-screen-mobile bg-background flex items-center justify-center">
        <div className="text-center">
          <PrivacyGraphic size={120} loading={true} />
          <p className="text-muted-foreground mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-mobile bg-background h-full">
      <div className="max-w-md mx-auto h-screen-mobile flex flex-col bg-card">
        <div className="pb-20 flex-1 overflow-y-auto relative">
          <DiscussionListPanel
            onRefresh={handlers.handleRefresh}
            onSelect={id => {
              navigate(`/discussion/${id}`);
            }}
            headerVariant="link"
          />
          {showDebugPanel && (
            <div className="fixed bottom-20 left-0 right-0">
              <DebugPanel />
            </div>
          )}
          <Button
            onClick={() => navigate('/new-discussion')}
            variant="primary"
            size="custom"
            className="absolute bottom-24 right-4 px-5 h-14 rounded-full flex items-center gap-2 shadow-lg hover:shadow-xl transition-shadow"
            title="Start new discussion"
          >
            <svg
              className="w-5 h-5 text-primary-foreground shrink-0"
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
            <span className="text-primary-foreground font-semibold text-sm whitespace-nowrap">
              New Chat
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Discussions;
