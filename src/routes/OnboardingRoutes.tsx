import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountStore } from '../stores/accountStore';
import OnboardingFlow from '../components/OnboardingFlow';
import AccountImport from '../components/account/AccountImport';
import AccountCreation from '../components/account/AccountCreation';

/**
 * Routes for onboarding flow (when no account exists)
 *
 * NOTE: This component uses component state (showSetup, showImport) instead of
 * URL-based routing. This means:
 * - Browser back/forward buttons won't step through the onboarding flow
 * - State is lost on page refresh
 * The rest of the app uses React Router for proper browser navigation support.
 * This is acceptable for a one-time onboarding experience
 */
export const OnboardingRoutes: React.FC<{
  showImport: boolean;
  onShowImportChange: (show: boolean) => void;
}> = ({ showImport, onShowImportChange }) => {
  const navigate = useNavigate();
  const [showSetup, setShowSetup] = useState(false);

  if (showImport) {
    return (
      <AccountImport
        onBack={() => onShowImportChange(false)}
        onComplete={() => {
          useAccountStore.setState({ isInitialized: true });
        }}
      />
    );
  }

  if (showSetup) {
    return (
      <AccountCreation
        onComplete={() => {
          useAccountStore.setState({ isInitialized: true });
          navigate('/', { replace: true });
        }}
        onBack={() => setShowSetup(false)}
      />
    );
  }

  return (
    <OnboardingFlow
      onComplete={() => {
        setShowSetup(true);
      }}
      onImportMnemonic={() => onShowImportChange(true)}
    />
  );
};
