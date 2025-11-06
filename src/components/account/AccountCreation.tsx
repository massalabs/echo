import React, { useState, useEffect } from 'react';
// Removed static logo in favor of animated PrivacyGraphic
import { useAccountStore } from '../../stores/accountStore';
import { addDebugLog } from '../ui/debugLogs';
import { validatePassword, validateUsername } from '../../utils/validation';
import PageHeader from '../ui/PageHeader';
import TabSwitcher from '../ui/TabSwitcher';
import Button from '../ui/Button';

interface AccountCreationProps {
  onComplete: () => void;
  onBack: () => void;
}

const AccountCreation: React.FC<AccountCreationProps> = ({
  onComplete,
  onBack,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [usePassword, setUsePassword] = useState(true); // Default to password for safety
  const [accountCreationStarted, setAccountCreationStarted] = useState(false);

  const {
    webauthnSupported: storeWebauthnSupported,
    platformAuthenticatorAvailable,
    initializeAccountWithBiometrics,
    initializeAccount,
    checkPlatformAvailability,
  } = useAccountStore();

  useEffect(() => {
    setWebauthnSupported(storeWebauthnSupported);

    // Check platform availability if WebAuthn is supported
    if (storeWebauthnSupported) {
      checkPlatformAvailability();
    }
  }, [storeWebauthnSupported, checkPlatformAvailability]);

  // In create flow, we no longer check for existing accounts. This screen is only for creating new accounts.

  useEffect(() => {
    setPlatformAvailable(platformAuthenticatorAvailable);

    // If biometrics are not available, force password mode
    if (!webauthnSupported || !platformAuthenticatorAvailable) {
      setUsePassword(true);
    } else {
      // If biometrics are available, default to biometrics but allow user to choose
      setUsePassword(false);
    }
  }, [webauthnSupported, platformAuthenticatorAvailable]);

  const validateUsernameField = (value: string) => {
    const result = validateUsername(value);
    setIsValid(result.valid);
    setUsernameError(result.error || null);
    return result.valid;
  };

  const validatePasswordField = (value: string) => {
    const result = validatePassword(value);
    setIsPasswordValid(result.valid);
    setPasswordError(result.error || null);
    return result.valid;
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    validateUsernameField(value);
    setError(null);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    validatePasswordField(value);
    setError(null);
  };

  const canSubmit = usePassword
    ? isValid && isPasswordValid && !isCreating
    : isValid && !isCreating;

  // No re-authentication in create flow

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling that might cause issues on mobile

    if (!canSubmit) {
      addDebugLog('Cannot submit - validation failed');
      return;
    }

    addDebugLog('Starting account creation process...');
    setIsCreating(true);
    setAccountCreationStarted(true); // Mark that we've started - prevent resets
    setError(null);

    try {
      addDebugLog(`Calling initializeAccount with username: ${username}`);
      if (usePassword) {
        await initializeAccount(username, password);
      } else {
        await initializeAccountWithBiometrics(username);
      }
      addDebugLog('Account initialization completed successfully');
      addDebugLog('Calling onComplete callback');

      // Call onComplete - this should trigger DiscussionList to transition
      onComplete();
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to create account';
      addDebugLog(`Account creation error: ${errorMsg}`);
      setError(errorMsg);
      setIsCreating(false);
      setAccountCreationStarted(false); // Reset on error so user can try again
    }
  };

  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="w-full max-w-sm mx-auto">
        {/* Header */}
        <PageHeader title="Create Account" onBack={onBack} />

        <div className="px-4">
          {/* Logo */}

          {/* Authentication Method Toggle */}
          {webauthnSupported && platformAvailable && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-4">
              <div className="mb-4">
                <p className="text-sm font-medium text-black dark:text-white mb-3">
                  Authentication Method
                </p>
                <TabSwitcher
                  options={[
                    {
                      value: 'biometrics',
                      label: 'Biometrics',
                      icon: (
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
                      ),
                    },
                    {
                      value: 'password',
                      label: 'Password',
                      icon: (
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ),
                    },
                  ]}
                  value={usePassword ? 'password' : 'biometrics'}
                  onChange={value => setUsePassword(value === 'password')}
                />
              </div>
            </div>
          )}

          {/* WebAuthn Support Check */}
          {(!webauthnSupported || !platformAvailable) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 border border-blue-200 dark:border-blue-800">
              <p className="text-blue-600 dark:text-blue-400 text-sm">
                Biometric authentication is not supported on this device. Using
                password authentication instead.
              </p>
            </div>
          )}

          {/* Account Form */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-black dark:text-white mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="Enter username"
                  className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors text-black dark:text-white bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 ${
                    usernameError
                      ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-600 focus:border-gray-400 dark:focus:border-gray-500'
                  }`}
                  maxLength={20}
                  disabled={isCreating}
                />
                {usernameError && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">
                    {usernameError}
                  </p>
                )}
              </div>

              {/* Password field - only show when using password authentication */}
              {usePassword && (
                <div>
                  <label className="block text-sm font-medium text-black dark:text-white mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={handlePasswordChange}
                    placeholder="Enter password"
                    className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors text-black dark:text-white bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 ${
                      passwordError
                        ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-500'
                        : 'border-gray-200 dark:border-gray-600 focus:border-gray-400 dark:focus:border-gray-500'
                    }`}
                    disabled={isCreating}
                  />
                  {passwordError && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1">
                      {passwordError}
                    </p>
                  )}
                </div>
              )}

              {/* Authentication Info */}
              <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <svg
                      className="h-5 w-5 text-green-500"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed">
                      {usePassword
                        ? 'Your account will be secured using a password. Make sure to choose a strong password.'
                        : 'Your account will be secured using biometric authentication (fingerprint, face ID, or Windows Hello).'}
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-600 dark:text-red-400 text-sm">
                    {error}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={!canSubmit || isCreating || accountCreationStarted}
                loading={isCreating || accountCreationStarted}
                variant="primary"
                size="custom"
                fullWidth
                className="h-11 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              >
                {!(isCreating || accountCreationStarted) && (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span>Create Account</span>
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountCreation;
