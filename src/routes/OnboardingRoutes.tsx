import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountStore } from '../stores/accountStore';
import OnboardingFlow from '../components/OnboardingFlow';
import AccountImport from '../components/account/AccountImport';
import AccountCreation from '../components/account/AccountCreation';

/**
 * Routes for onboarding flow (when no account exists)
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
