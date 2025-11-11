import React from 'react';
import DiscussionListPanel from '../components/discussions/DiscussionList';
import DebugPanel from '../components/ui/DebugPanel';
import { useAccountStore } from '../stores/accountStore';
import { useAppStore } from '../stores/appStore';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { PrivacyGraphic } from '../components/ui/PrivacyGraphic';

const Discussions: React.FC = () => {
  const refreshAppState = useAppStore(s => s.refreshAppState);
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
      <div className="max-w-md mx-auto h-screen-mobile flex flex-col bg-card relative">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-medium text-foreground">Discussions</h2>
          <button
            onClick={refreshAppState}
            className="text-xs text-primary hover:text-primary/80 underline"
          >
            Refresh
          </button>
        </div>
        <div className="pb-20 flex-1 overflow-y-auto">
          <DiscussionListPanel
            onRefresh={refreshAppState}
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
        <Button
          onClick={() => navigate('/new-discussion')}
          variant="primary"
          size="custom"
          className="absolute bottom-24 right-4 px-5 h-14 rounded-full flex items-center gap-2 shadow-lg hover:shadow-xl transition-shadow z-50"
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
  );
};

export default Discussions;
