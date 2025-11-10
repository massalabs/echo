import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAccountStore } from '../stores/accountStore';
import Login from '../pages/Login';
import AccountCreation from '../components/account/AccountCreation';
import { UserProfile } from '../db';

interface UnauthenticatedRoutesProps {
  existingAccountInfo: UserProfile | null;
  loginError: string | null;
  onLoginErrorChange: (error: string | null) => void;
}

/**
 * Routes accessible when user is not authenticated
 */
export const UnauthenticatedRoutes: React.FC<UnauthenticatedRoutesProps> = ({
  existingAccountInfo,
  loginError,
  onLoginErrorChange,
}) => {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/welcome"
        element={
          <Login
            key="login-router"
            onCreateNewAccount={() => {
              onLoginErrorChange(null); // Clear error when navigating to setup
              navigate('/setup');
            }}
            onAccountSelected={() => {
              // Only navigate if userProfile is actually set (successful login)
              // The route will automatically update when userProfile changes
              onLoginErrorChange(null); // Clear error on successful login
            }}
            accountInfo={existingAccountInfo}
            persistentError={loginError}
            onErrorChange={onLoginErrorChange}
          />
        }
      />
      <Route
        path="/setup"
        element={
          <AccountCreation
            onComplete={() => {
              useAccountStore.setState({ isInitialized: true });
              // After account creation, go to discussions
              navigate('/', { replace: true });
            }}
            onBack={() => {
              // If there is at least one account, go back to welcome; otherwise go to onboarding
              useAccountStore
                .getState()
                .hasExistingAccount()
                .then(hasAny => {
                  if (hasAny) {
                    navigate('/welcome');
                  } else {
                    useAccountStore.setState({ isInitialized: false });
                  }
                })
                .catch(() => {
                  // On error, fall back to onboarding
                  useAccountStore.setState({ isInitialized: false });
                });
            }}
          />
        }
      />
      <Route path="/" element={<Navigate to="/welcome" replace />} />
      <Route path="*" element={<Navigate to="/welcome" replace />} />
    </Routes>
  );
};
