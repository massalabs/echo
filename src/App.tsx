import React, { useEffect, useState } from 'react';
import { HashRouter } from 'react-router-dom';
import { useAccountStore } from './stores/accountStore';
import ErrorBoundary from './components/ui/ErrorBoundary.tsx';
import PWABadge from './PWABadge.tsx';
import DebugOverlay from './components/ui/DebugOverlay.tsx';
import { addDebugLog } from './components/ui/debugLogs';
import { Toaster } from 'react-hot-toast';
import { PrivacyGraphic } from './components/ui/PrivacyGraphic';
import './App.css';

// Hooks
import { useProfileLoader } from './hooks/useProfileLoader';
// import { useBackgroundSync } from './hooks/useBackgroundSync';
import { useAppStateRefresh } from './hooks/useAppStateRefresh';
import { useAccountInfo } from './hooks/useAccountInfo';
import { useAuthRouting } from './hooks/useAuthRouting';

// Route components
import { AuthenticatedRoutes } from './routes/AuthenticatedRoutes';
import { UnauthenticatedRoutes } from './routes/UnauthenticatedRoutes';
import { OnboardingRoutes } from './routes/OnboardingRoutes';
import { useMessageStore } from './stores/messageStore.tsx';
import { useDiscussionStore } from './stores/discussionStore.tsx';

const AppContent: React.FC = () => {
  const { isInitialized, isLoading, userProfile } = useAccountStore();
  const initMessage = useMessageStore(s => s.init);
  const initDiscussion = useDiscussionStore(s => s.init);
  const [showImport, setShowImport] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Custom hooks for app initialization and state management
  useProfileLoader();
  // Don't use background sync for now
  // useBackgroundSync();
  useAppStateRefresh();
  const existingAccountInfo = useAccountInfo();
  useAuthRouting();

  addDebugLog(
    `AppContent render: init=${isInitialized}, loading=${isLoading}, hasProfile=${!!userProfile}`
  );

  useEffect(() => {
    if (userProfile?.userId) {
      initMessage();
      initDiscussion();
    }
  }, [userProfile?.userId, initMessage, initDiscussion]);

  // Show global loader only during initial boot, not during sign-in.
  if (isLoading && !isInitialized && !userProfile) {
    return (
      <div className="min-h-screen-mobile bg-background flex items-center justify-center">
        <div className="text-center">
          <PrivacyGraphic size={120} loading={true} />
          <p className="text-sm text-muted-foreground mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  // If authenticated, show main app routes
  if (userProfile) {
    return <AuthenticatedRoutes />;
  }

  // If not initialized and no profile, show onboarding
  if (!isInitialized) {
    return (
      <OnboardingRoutes
        showImport={showImport}
        onShowImportChange={setShowImport}
      />
    );
  }

  // Initialized but unauthenticated: route between Login and Setup
  return (
    <UnauthenticatedRoutes
      existingAccountInfo={existingAccountInfo}
      loginError={loginError}
      onLoginErrorChange={setLoginError}
    />
  );
};

function App() {
  return (
    <HashRouter>
      <ErrorBoundary>
        <AppContent />
        <DebugOverlay />
        <div className="hidden">
          <PWABadge />
        </div>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#4ade80',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </ErrorBoundary>
    </HashRouter>
  );
}

export default App;
