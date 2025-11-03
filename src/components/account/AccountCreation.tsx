import React, { useState, useEffect } from 'react';
import appLogo from '../../assets/echo_face.svg';
import { useAccountStore } from '../../stores/accountStore';
import { addDebugLog } from '../ui/debugLogs';
import { validatePassword, validateUsername } from '../../utils/validation';

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
    <div className="min-h-screen-mobile bg-white dark:bg-gray-900">
      <div className="w-full max-w-sm mx-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="text-xl font-semibold text-black dark:text-white">
              Create Account
            </h1>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-4">
          {/* Logo */}
          <div className="text-center mb-8">
            <img
              src={appLogo}
              className="w-32 h-32 mx-auto mb-6 rounded-full object-cover"
              alt="Echo logo"
            />
          </div>

          {/* Authentication Method Toggle */}
          {webauthnSupported && platformAvailable && (
            <div className="w-full mb-6 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex items-center justify-center mb-3">
                <p className="flex text-sm font-medium text-gray-700 dark:text-gray-300">
                  Authentication Method:
                </p>
              </div>
              {/* Segmented toggle */}
              <div className="relative bg-gray-100 dark:bg-gray-700 rounded-lg p-1 h-10 flex items-center">
                {/* Moving thumb */}
                <div
                  className={`absolute top-1 bottom-1 w-1/2 rounded-md bg-white dark:bg-gray-800 shadow transition-transform duration-200 ease-out ${
                    usePassword ? 'translate-x-full' : 'translate-x-0'
                  }`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => setUsePassword(false)}
                  className={`relative z-10 flex-1 h-8 inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${
                    !usePassword
                      ? 'text-black dark:text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                  aria-pressed={!usePassword}
                >
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
                  Biometrics
                </button>
                <button
                  type="button"
                  onClick={() => setUsePassword(true)}
                  className={`relative z-10 flex-1 h-8 inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${
                    usePassword
                      ? 'text-black dark:text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                  aria-pressed={usePassword}
                >
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
                  Password
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
                <input
                  type="password"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Enter password"
                  className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400 ${
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
            <div
              className={`p-4 border rounded-lg bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800`}
            >
              <div className="flex items-center">
                <div className="shrink-0">
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
                </div>
                <div className="ml-3">
                  <p className={`text-sm text-green-700 dark:text-green-300`}>
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
    </div>
  );
};

export default AccountCreation;
