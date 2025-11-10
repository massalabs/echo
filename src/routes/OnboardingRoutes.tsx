import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountStore } from '../stores/accountStore';
import OnboardingFlow from '../components/OnboardingFlow';
import AccountImport from '../components/account/AccountImport';

/**
 * Routes for onboarding flow (when no account exists)
 */
export const OnboardingRoutes: React.FC<{
  showImport: boolean;
  onShowImportChange: (show: boolean) => void;
}> = ({ showImport, onShowImportChange }) => {
  const navigate = useNavigate();

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

  return (
    <OnboardingFlow
      onComplete={() => {
        // When onboarding is complete, mark initialized and navigate to setup
        useAccountStore.setState({ isInitialized: true });
        navigate('/setup');
      }}
      onImportMnemonic={() => onShowImportChange(true)}
    />
  );
};
