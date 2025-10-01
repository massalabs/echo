import React, { useState, useEffect } from 'react';
import appLogo from '../assets/echo_face.svg';
import { useAccountStore } from '../stores/accountStore';

interface UsernameSetupProps {
  onComplete: () => void;
}

const UsernameSetup: React.FC<UsernameSetupProps> = ({ onComplete }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [usePassword, setUsePassword] = useState(true); // Default to password for safety
  const [hasExistingWebAuthnProfile, setHasExistingWebAuthnProfile] =
    useState(false);

  const {
    webauthnSupported: storeWebauthnSupported,
    platformAuthenticatorAvailable,
    initializeAccountWithBiometrics,
    initializeAccount,
    loadAccountWithBiometrics,
    checkPlatformAvailability,
  } = useAccountStore();

  useEffect(() => {
    setWebauthnSupported(storeWebauthnSupported);

    // Check platform availability if WebAuthn is supported
    if (storeWebauthnSupported) {
      checkPlatformAvailability();
    }
  }, [storeWebauthnSupported, checkPlatformAvailability]);

  // Check for existing WebAuthn profile on component mount
  useEffect(() => {
    const checkExistingProfile = async () => {
      try {
        const { db } = await import('../db');
        const profile = await db.userProfile.toCollection().first();
        if (profile?.security?.webauthn?.credentialId) {
          setHasExistingWebAuthnProfile(true);
          // If there's an existing WebAuthn profile, default to biometrics
          if (webauthnSupported && platformAvailable) {
            setUsePassword(false);
          }
        }
      } catch (error) {
        console.error('Error checking for existing profile:', error);
      }
    };

    checkExistingProfile();
  }, [webauthnSupported, platformAvailable]);

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
    const valid = value.length >= 8;
    setIsPasswordValid(valid);
    return valid;
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

  const handleReAuthenticate = async () => {
    setIsCreating(true);
    setError(null);

    try {
      console.log(
        'Attempting to re-authenticate with existing WebAuthn profile'
      );
      await loadAccountWithBiometrics();
      onComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to re-authenticate'
      );
      setIsCreating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (canSubmit) {
      setIsCreating(true);
      setError(null);

      try {
        if (usePassword) {
          await initializeAccount(username, password);
        } else {
          await initializeAccountWithBiometrics(username);
        }
        onComplete();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to create account'
        );
        setIsCreating(false);
      }
    }
  };

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
            {hasExistingWebAuthnProfile ? 'Sign In' : 'Create Your Account'}
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            {hasExistingWebAuthnProfile
              ? 'Re-authenticate with your biometrics to access your Echo account'
              : usePassword
                ? 'Choose a username and password for your Echo account'
                : 'Choose a username and use biometric authentication to secure your Echo account'}
          </p>
        </div>

        {/* Re-authentication option for existing WebAuthn profiles */}
        {hasExistingWebAuthnProfile &&
          webauthnSupported &&
          platformAvailable && (
            <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-center">
                <div className="mb-4">
                  <svg
                    className="w-12 h-12 mx-auto text-blue-600 mb-3"
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
                  <h3 className="text-lg font-semibold text-blue-800 mb-2">
                    Welcome Back!
                  </h3>
                  <p className="text-sm text-blue-700 mb-1">
                    We found your existing biometric account
                  </p>
                  <p className="text-xs text-blue-600">
                    Click below to re-authenticate with your biometrics (Touch
                    ID, Face ID, etc.)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReAuthenticate}
                  disabled={isCreating}
                  className="w-full h-12 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Re-authenticating...
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
                      Re-authenticate with Biometrics
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        {/* Authentication Method Toggle */}
        {webauthnSupported &&
          platformAvailable &&
          !hasExistingWebAuthnProfile && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Authentication Method
                  </p>
                  <p className="text-xs text-gray-500">
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
        {!webauthnSupported && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-600 text-sm">
              Biometric authentication is not supported in this browser. Using
              password authentication instead.
            </p>
          </div>
        )}

        {webauthnSupported && !platformAvailable && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-600 text-sm">
              Biometric authentication is not available on this device. Using
              password authentication instead.
            </p>
          </div>
        )}

        {/* Account Form - only show if no existing WebAuthn profile or user chose to create new */}
        {!hasExistingWebAuthnProfile && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                type="text"
                value={username}
                onChange={handleUsernameChange}
                placeholder="Enter username"
                className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors ${
                  username && !isValid
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-gray-200 focus:border-gray-400'
                }`}
                maxLength={20}
                disabled={isCreating}
              />
              {username && !isValid && (
                <p className="text-red-500 text-xs mt-1">
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
                  className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors ${
                    password && !isPasswordValid
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-gray-200 focus:border-gray-400'
                  }`}
                  disabled={isCreating}
                />
                {password && !isPasswordValid && (
                  <p className="text-red-500 text-xs mt-1">
                    Password must be at least 8 characters long
                  </p>
                )}
              </div>
            )}

            {/* Authentication Info */}
            <div
              className={`p-4 border rounded-lg ${
                usePassword
                  ? 'bg-green-50 border-green-200'
                  : 'bg-blue-50 border-blue-200'
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
                      usePassword ? 'text-green-700' : 'text-blue-700'
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
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full h-12 rounded-lg text-sm font-medium transition-colors duration-200 ${
                canSubmit
                  ? 'bg-black text-white hover:bg-gray-800'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isCreating
                ? 'Creating Account...'
                : usePassword
                  ? 'Create Account with Password'
                  : 'Create Account with Biometrics'}
            </button>
          </form>
        )}

        {/* Create New Account option for existing profiles */}
        {hasExistingWebAuthnProfile && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setHasExistingWebAuthnProfile(false)}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Create New Account Instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UsernameSetup;
