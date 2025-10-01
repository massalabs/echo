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
  const {
    isInitialized,
    isLoading,
    setLoading,
    webauthnSupported,
    platformAuthenticatorAvailable,
  } = useAccountStore();
  const [showUsernameSetup, setShowUsernameSetup] = useState(false);

  // Load profile from Dexie on app start
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      // Add a small delay to ensure database is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const profile = await db.userProfile.toCollection().first();

      if (profile) {
        // Check if this is a WebAuthn-based profile
        if (
          profile.security?.webauthn?.credentialId &&
          webauthnSupported &&
          platformAuthenticatorAvailable
        ) {
          // Don't automatically try to authenticate with biometrics
          // Instead, show the username setup with re-authentication option
          console.log(
            'WebAuthn profile found, showing re-authentication option'
          );
          setShowUsernameSetup(true);
        } else if (
          profile.security?.password?.salt &&
          profile.security?.password?.kdf
        ) {
          // Password-based profile - show username setup for password entry
          setShowUsernameSetup(true);
        } else {
          // Unknown profile type - show username setup
          setShowUsernameSetup(true);
        }
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
  }, [setLoading, webauthnSupported, platformAuthenticatorAvailable]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleOnboardingComplete = () => {
    setShowUsernameSetup(true);
  };

  const handleUsernameComplete = async () => {
    // Account initialization is already handled in UsernameSetup component
    // Just hide the username setup form
    setShowUsernameSetup(false);
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
