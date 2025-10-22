import React, { useEffect, useCallback } from 'react';
import { useAccountStore } from './stores/accountStore';
import { db } from './db';
import OnboardingFlow from './components/OnboardingFlow';
import MainApp from './components/MainApp';
import ErrorBoundary from './components/ErrorBoundary';
import PWABadge from './PWABadge.tsx';
import './App.css';

const AppContent: React.FC = () => {
  const { isInitialized, isLoading, setLoading } = useAccountStore();

  // Load profile from Dexie on app start
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      // Add a small delay to ensure database is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const profile = await db.userProfile.toCollection().first();

      if (profile) {
        // Profile exists - let MainApp handle the welcome flow
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
  }, [loadProfile]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return <OnboardingFlow onComplete={() => {}} />;
  }

  return <MainApp />;
};

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      {/* PWA Badge - hidden for now to match design */}
      <div className="hidden">
        <PWABadge />
      </div>
    </ErrorBoundary>
  );
}

export default App;
