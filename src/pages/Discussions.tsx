import React from 'react';
import DiscussionListPanel from '../components/discussions/DiscussionList';
import DebugPanel from '../components/ui/DebugPanel';
import { useAccountStore } from '../stores/accountStore';
import { useAppStore } from '../stores/appStore';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { PrivacyGraphic } from '../components/ui/PrivacyGraphic';
import { triggerManualSync } from '../services/messageSync';

const Discussions: React.FC = () => {
  const navigate = useNavigate();
  const isLoading = useAccountStore(s => s.isLoading);
  const showDebugPanel = useAppStore(s => s.showDebugPanel);
  if (isLoading) {
    return (
      <div className="bg-background flex items-center justify-center">
        <div className="text-center">
          <PrivacyGraphic size={120} loading={true} />
          <p className="text-muted-foreground mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background overflow-hidden h-full">
      <div className="h-full max-w-md mx-auto flex flex-col bg-card">
        <div className="px-6 py-4 max-w-md m-auto border-b border-border flex justify-between items-center fixed top-0 left-0 right-0 z-50 bg-card">
          <h2 className="text-lg font-medium text-foreground">Discussions</h2>
          <button
            onClick={() => triggerManualSync()}
            className="text-xs text-primary hover:text-primary/80 underline"
          >
            Refresh
          </button>
        </div>
        <div className="pb-20 flex-1 overflow-y-auto mt-16">
          <DiscussionListPanel
            onRefresh={() => triggerManualSync()}
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
          <div className="h-24"></div>
        </div>
      </div>
      <div className="fixed bottom-nav-offset left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-md mx-auto px-4 pointer-events-auto flex justify-end">
          <Button
            onClick={() => navigate('/new-discussion')}
            variant="primary"
            size="custom"
            className="px-5 h-14 rounded-full flex items-center gap-2 shadow-lg hover:shadow-xl transition-shadow"
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
