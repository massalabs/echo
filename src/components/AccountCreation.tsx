import React, { useState, useEffect } from 'react';
import appLogo from '../assets/echo_face.svg';
import { useAccountStore } from '../stores/accountStore';
import { addDebugLog } from './debugLogs';
import { validatePassword as _validatePassword } from '../utils/validation';

interface AccountCreationProps {
  onComplete: () => void;
}

const AccountCreation: React.FC<AccountCreationProps> = ({ onComplete }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const validateUsername = (value: string) => {
    const valid =
      value.length >= 3 && value.length <= 20 && /^[a-zA-Z0-9_]+$/.test(value);
    setIsValid(valid);
    return valid;
  };

  const validatePassword = (value: string) => {
    const result = _validatePassword(value);
    setIsPasswordValid(result.valid);
    return result.valid;
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    validateUsername(value);
    setError(null);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    validatePassword(value);
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

      // Call onComplete - this should trigger MainApp to transition
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
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={appLogo}
            className="w-32 h-32 mx-auto mb-6 rounded-full object-cover"
            alt="Echo logo"
          />
          <h1 className="text-2xl font-semibold text-black dark:text-white mb-2">
            Create Your Account
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {usePassword
              ? 'Choose a username and password for your Echo account'
              : 'Choose a username and use biometric authentication to secure your Echo account'}
          </p>
        </div>

        {/* Authentication Method Toggle */}
        {webauthnSupported && platformAvailable && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Authentication Method
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {usePassword
                    ? 'Using password authentication'
                    : 'Using biometric authentication'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUsePassword(!usePassword)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {usePassword ? 'Use Biometrics' : 'Use Password'}
              </button>
            </div>
          </div>
        )}

        {/* WebAuthn Support Check */}
        {(!webauthnSupported || !platformAvailable) && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-blue-600 dark:text-blue-400 text-sm">
              Biometric authentication is not supported in this device. Using
              password authentication instead.
            </p>
          </div>
        )}

        {/* Account Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Enter username"
              className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400 ${
                username && !isValid
                  ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-500'
                  : 'border-gray-200 dark:border-gray-600 focus:border-gray-400 dark:focus:border-gray-500'
              }`}
              maxLength={20}
              disabled={isCreating}
            />
            {username && !isValid && (
              <p className="text-red-500 dark:text-red-400 text-xs mt-1">
                Username must be 3-20 characters, letters, numbers, and
                underscores only
              </p>
            )}
          </div>

          {/* Password field - only show when using password authentication */}
          {usePassword && (
            <div>
              <input
                type="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="Enter password"
                className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400 ${
                  password && !isPasswordValid
                    ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-500'
                    : 'border-gray-200 dark:border-gray-600 focus:border-gray-400 dark:focus:border-gray-500'
                }`}
                disabled={isCreating}
              />
              {password && !isPasswordValid && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-1">
                  {_validatePassword(password).error}
                </p>
              )}
            </div>
          )}

          {/* Authentication Info */}
          <div
            className={`p-4 border rounded-lg ${
              usePassword
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            }`}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {usePassword ? (
                  <svg
                    className="h-5 w-5 text-green-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5 text-blue-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <p
                  className={`text-sm ${
                    usePassword
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-blue-700 dark:text-blue-300'
                  }`}
                >
                  {usePassword
                    ? 'Your account will be secured using a password. Make sure to choose a strong password.'
                    : 'Your account will be secured using biometric authentication (fingerprint, face ID, or Windows Hello).'}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || isCreating || accountCreationStarted}
            className={`w-full h-12 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center justify-center gap-2 ${
              canSubmit && !isCreating && !accountCreationStarted
                ? 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            {isCreating || accountCreationStarted ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AccountCreation;
