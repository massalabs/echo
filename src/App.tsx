import React, { useState, useEffect, useCallback } from 'react';
import { useAccountStore } from './stores/accountStore';
import { db } from './db';
import OnboardingFlow from './components/OnboardingFlow';
import UsernameSetup from './components/UsernameSetup';
import MainApp from './components/MainApp';
import ErrorBoundary from './components/ErrorBoundary';
import PWABadge from './PWABadge.tsx';
import './App.css';

const AppContent: React.FC = () => {
  const { isInitialized, isLoading, initializeAccount, setLoading } =
    useAccountStore();
  const [showUsernameSetup, setShowUsernameSetup] = useState(false);

  // Load profile from Dexie on app start
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      // Add a small delay to ensure database is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const profile = await db.userProfile.toCollection().first();

      if (profile) {
        // Update the store with the loaded profile
        useAccountStore.setState({ userProfile: profile, isInitialized: true });
      } else {
        // Make sure we set isInitialized to false when no profile exists
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

  const handleOnboardingComplete = () => {
    setShowUsernameSetup(true);
  };

  const handleUsernameComplete = async (username: string) => {
    try {
      await initializeAccount(username);
      setShowUsernameSetup(false);
    } catch (error) {
      console.error('Failed to initialize account:', error);
      // You might want to show an error message to the user here
    }
  };

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

  if (showUsernameSetup) {
    return <UsernameSetup onComplete={handleUsernameComplete} />;
  }

  if (!isInitialized) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
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
