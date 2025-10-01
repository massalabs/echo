import React, { useState, useEffect } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { UserProfile } from '../db';
import AccountSelection from './AccountSelection';
import AccountImport from './AccountImport';
import appLogo from '../assets/echo_face.svg';

interface WelcomeBackProps {
  onCreateNewAccount: () => void;
  onAccountSelected: () => void;
  accountInfo?: UserProfile | null;
}

const WelcomeBack: React.FC<WelcomeBackProps> = ({
  onCreateNewAccount,
  onAccountSelected,
  accountInfo,
}) => {
  const {
    userProfile,
    loadAccountWithBiometrics,
    loadAccount,
    webauthnSupported,
    platformAuthenticatorAvailable,
  } = useAccountStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [showAccountSelection, setShowAccountSelection] = useState(false);
  const [showAccountImport, setShowAccountImport] = useState(false);

  useEffect(() => {
    // Check if this is a biometric account using accountInfo or userProfile
    const account = accountInfo || userProfile;
    if (account?.security?.webauthn?.credentialId) {
      setUsePassword(false);
    } else {
      setUsePassword(true);
    }
  }, [userProfile, accountInfo]);

  const handleBiometricAuth = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await loadAccountWithBiometrics();
      onAccountSelected();
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      setError(
        error instanceof Error
          ? error.message
          : 'Biometric authentication failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordAuth = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setPasswordError('');

      if (!password.trim()) {
        setPasswordError('Password is required');
        return;
      }

      await loadAccount(password);
      onAccountSelected();
    } catch (error) {
      console.error('Password authentication failed:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Invalid password. Please try again.';
      setPasswordError(errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeAccount = () => {
    setShowAccountSelection(true);
  };

  const handleAccountSelected = () => {
    setShowAccountSelection(false);
    onAccountSelected();
  };

  const handleBackFromSelection = () => {
    setShowAccountSelection(false);
  };

  const handleBackFromImport = () => {
    setShowAccountImport(false);
  };

  const handleImportComplete = () => {
    setShowAccountImport(false);
    onAccountSelected();
  };

  const canUseBiometrics =
    webauthnSupported && platformAuthenticatorAvailable && !usePassword;

  // Show account selection screen if active
  if (showAccountSelection) {
    return (
      <AccountSelection
        onBack={handleBackFromSelection}
        onCreateNewAccount={onCreateNewAccount}
        onAccountSelected={handleAccountSelected}
      />
    );
  }

  // Show account import screen if active
  if (showAccountImport) {
    return (
      <AccountImport
        onBack={handleBackFromImport}
        onComplete={handleImportComplete}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={appLogo}
            className="w-32 h-32 mx-auto mb-6 rounded-full object-cover"
            alt="Echo logo"
          />
          <h1 className="text-2xl font-semibold text-black mb-2">
            Welcome Back!
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Hello,{' '}
            <span className="font-semibold">
              {(accountInfo || userProfile)?.username}
            </span>
          </p>
        </div>

        {/* Authentication Section */}
        <div className="space-y-6">
          {/* Biometric Authentication */}
          {canUseBiometrics && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-blue-800 mb-2">
                  Use Biometric Authentication
                </h3>
                <p className="text-sm text-blue-700 mb-4">
                  Sign in with your fingerprint, face ID, or Windows Hello
                </p>
                <button
                  onClick={handleBiometricAuth}
                  disabled={isLoading}
                  className="w-full h-12 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                      Authenticate with Biometrics
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Password Authentication */}
          {usePassword && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-black mb-4">
                Enter Your Password
              </h3>
              <div className="space-y-4">
                <div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors border-gray-200 focus:border-gray-400"
                    disabled={isLoading}
                  />
                  {passwordError && (
                    <p className="text-red-500 text-xs mt-1">{passwordError}</p>
                  )}
                </div>
                <button
                  onClick={handlePasswordAuth}
                  disabled={isLoading || !password.trim()}
                  className="w-full h-12 rounded-lg text-sm font-medium transition-colors duration-200 bg-black text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Signing In...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Account Options */}
          <div className="space-y-3">
            <button
              onClick={handleChangeAccount}
              className="w-full h-12 bg-white border border-gray-200 rounded-lg text-sm font-medium text-black hover:bg-gray-50 transition-colors"
            >
              Change Account
            </button>
            <button
              onClick={onCreateNewAccount}
              className="w-full h-12 bg-gray-100 rounded-lg text-sm font-medium text-black hover:bg-gray-200 transition-colors"
            >
              Create New Account
            </button>
            <button
              onClick={() => setShowAccountImport(true)}
              className="w-full h-12 bg-white border border-gray-200 rounded-lg text-sm font-medium text-black hover:bg-gray-50 transition-colors"
            >
              Import Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeBack;
