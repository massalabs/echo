import React, { useEffect, useCallback, useState } from 'react';
import { useAccountStore } from './stores/accountStore';
import { db } from './db';
import OnboardingFlow from './components/OnboardingFlow';
import DiscussionList from './components/DiscussionList';
import ErrorBoundary from './components/ErrorBoundary';
import PWABadge from './PWABadge.tsx';
import DebugOverlay from './components/DebugOverlay';
import { addDebugLog } from './components/debugLogs';
import AccountImport from './components/AccountImport';
import './App.css';

const AppContent: React.FC = () => {
  const { isInitialized, isLoading, setLoading, userProfile } =
    useAccountStore();
  const [showImport, setShowImport] = useState(false);

  addDebugLog(
    `AppContent render: init=${isInitialized}, loading=${isLoading}, hasProfile=${!!userProfile}`
  );

  // Load profile from Dexie on app start
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      // Add a small delay to ensure database is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const state = useAccountStore.getState();
      const profile =
        state.userProfile || (await db.userProfile.toCollection().first());

      if (profile) {
        // Profile exists - let DiscussionList handle the welcome flow
        useAccountStore.setState({ isInitialized: true });
      } else {
        // No profile exists - show onboarding
        useAccountStore.setState({ isInitialized: false });
      }
    } catch (error) {
      console.error('Error loading user profile from Dexie:', error);
      // On error, assume no profile exists
      useAccountStore.setState({ isInitialized: false });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  if (isLoading) {
    addDebugLog('Rendering loading screen');
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If we have a user profile, always show MainApp (user is authenticated)
  if (userProfile) {
    addDebugLog('Rendering DiscussionList - user profile exists');
    return <DiscussionList />;
  }

  // If not initialized and no profile, show onboarding
  if (!isInitialized) {
    addDebugLog('Rendering OnboardingFlow - not initialized');
    if (showImport) {
      return (
        <AccountImport
          onBack={() => setShowImport(false)}
          onComplete={() => {
            addDebugLog(
              'AccountImport completed - setting isInitialized to true'
            );
            useAccountStore.setState({ isInitialized: true });
          }}
        />
      );
    }
    return (
      <OnboardingFlow
        onComplete={() => {
          // When onboarding is complete, set isInitialized to true to trigger DiscussionList
          addDebugLog(
            'OnboardingFlow completed - setting isInitialized to true'
          );
          useAccountStore.setState({ isInitialized: true });
        }}
        onImportMnemonic={() => setShowImport(true)}
      />
    );
  }

  // If initialized but no profile, show DiscussionList (it will handle showing account creation)
  addDebugLog('Rendering DiscussionList - initialized but no profile');
  return <DiscussionList />;
};

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <DebugOverlay />
      {/* PWA Badge - hidden for now to match design */}
      <div className="hidden">
        <PWABadge />
      </div>
    </ErrorBoundary>
  );
}

export default App;
