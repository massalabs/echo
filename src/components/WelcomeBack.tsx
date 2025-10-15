import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { UserProfile } from '../db';
import AccountSelection from './AccountSelection';
import AccountImport from './AccountImport';
import appLogo from '../assets/echo_face.svg';

// Persist the last selected account across re-renders/remounts
let globalSelectedAccountId: number | null = null;
let globalSelectedUsername: string | null = null;

interface WelcomeBackProps {
  onCreateNewAccount: () => void;
  onAccountSelected: () => void;
  accountInfo?: UserProfile | null;
  persistentError?: string | null;
  onErrorChange?: (error: string | null) => void;
}

const WelcomeBack: React.FC<WelcomeBackProps> = React.memo(
  ({
    onCreateNewAccount,
    onAccountSelected,
    accountInfo,
    persistentError = null,
    onErrorChange,
  }) => {
    // Use specific selectors to avoid re-renders when store updates
    const userProfile = useAccountStore(state => state.userProfile);
    const loadAccountWithBiometrics = useAccountStore(
      state => state.loadAccountWithBiometrics
    ) as unknown as (accountId?: number) => Promise<void>;
    const loadAccount = useAccountStore(state => state.loadAccount);
    const getAllAccounts = useAccountStore(state => state.getAllAccounts);
    const webauthnSupported = useAccountStore(state => state.webauthnSupported);
    const platformAuthenticatorAvailable = useAccountStore(
      state => state.platformAuthenticatorAvailable
    );
    const checkPlatformAvailability = useAccountStore(
      state => state.checkPlatformAvailability
    );

    const [isLoading, setIsLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [usePassword, setUsePassword] = useState(false);
    const [showAccountSelection, setShowAccountSelection] = useState(false);
    const [showAccountImport, setShowAccountImport] = useState(false);
    const [selectedAccountInfo, setSelectedAccountInfo] =
      useState<UserProfile | null>(null);
    const [autoAuthTriggered, setAutoAuthTriggered] = useState(false);
    const [platformResolved, setPlatformResolved] = useState(false);
    const lastAutoAuthCredentialIdRef = useRef<string | null>(null);

    // Use persistent error from parent, or fall back to local state
    const passwordError = persistentError || '';
    const error = persistentError;

    // Use selected account if available, otherwise use accountInfo prop
    const currentAccount = selectedAccountInfo || accountInfo;

    // Rehydrate selected account from globals if local state is empty
    useEffect(() => {
      (async () => {
        if (
          !selectedAccountInfo &&
          (globalSelectedAccountId != null || globalSelectedUsername)
        ) {
          try {
            const all = await getAllAccounts();
            let match: UserProfile | null = null;
            if (globalSelectedAccountId != null) {
              match = all.find(a => a.id === globalSelectedAccountId) || null;
            }
            if (!match && globalSelectedUsername) {
              match =
                all.find(a => a.username === globalSelectedUsername) || null;
            }
            if (match) {
              setSelectedAccountInfo(match);
            }
          } catch {
            // ignore
          }
        }
      })();
    }, [selectedAccountInfo, getAllAccounts]);

    useEffect(() => {
      // Check if this is a biometric account using currentAccount or userProfile
      const account = currentAccount || userProfile;
      const shouldUsePassword = !account?.security?.webauthn?.credentialId;
      setUsePassword(prev =>
        prev !== shouldUsePassword ? shouldUsePassword : prev
      );
    }, [userProfile, currentAccount]);

    // Ensure platform availability flag is up-to-date before showing warnings
    useEffect(() => {
      if (platformResolved) return;
      (async () => {
        try {
          await checkPlatformAvailability();
        } catch {
          // ignore errors; UI will fall back gracefully
        } finally {
          setPlatformResolved(true);
        }
      })();
    }, [checkPlatformAvailability, platformResolved]);

    // If user just selected an account that supports biometrics, auto-prompt once
    const handleBiometricAuth = useCallback(async () => {
      try {
        setIsLoading(true);
        onErrorChange?.(null);

        // Resolve the correct account id when available to avoid loading the wrong profile
        const account = currentAccount || userProfile;
        let targetAccountId = account?.id ?? null;
        if (targetAccountId == null && account?.username) {
          try {
            const all = await getAllAccounts();
            const match = all.find(a => a.username === account.username);
            if (match?.id != null) {
              targetAccountId = match.id;
            }
          } catch {
            // ignore lookup errors
          }
        }

        await loadAccountWithBiometrics(targetAccountId ?? undefined);
        onAccountSelected();
      } catch (error) {
        console.error('Biometric authentication failed:', error);
        onErrorChange?.(
          error instanceof Error
            ? error.message
            : 'Biometric authentication failed. Please try again.'
        );
      } finally {
        setIsLoading(false);
      }
    }, [
      currentAccount,
      userProfile,
      onErrorChange,
      getAllAccounts,
      loadAccountWithBiometrics,
      onAccountSelected,
    ]);

    useEffect(() => {
      if (autoAuthTriggered || !selectedAccountInfo) return;
      const credentialId =
        selectedAccountInfo.security?.webauthn?.credentialId || null;
      if (!credentialId) return;
      if (lastAutoAuthCredentialIdRef.current === credentialId) return;
      if (!webauthnSupported || !platformAuthenticatorAvailable) return;
      lastAutoAuthCredentialIdRef.current = credentialId;
      setAutoAuthTriggered(true);
      handleBiometricAuth();
    }, [
      autoAuthTriggered,
      selectedAccountInfo,
      webauthnSupported,
      platformAuthenticatorAvailable,
      handleBiometricAuth,
    ]);

    const handlePasswordAuth = async () => {
      setIsLoading(true);
      onErrorChange?.(null);

      try {
        if (!password.trim()) {
          onErrorChange?.('Password is required');
          setIsLoading(false);
          return;
        }

        const account = currentAccount || userProfile;
        // Resolve correct account id to avoid falling back to first DB user
        let targetAccountId = account?.id;
        if (targetAccountId == null && account?.username) {
          try {
            const all = await getAllAccounts();
            const match = all.find(a => a.username === account.username);
            if (match?.id != null) {
              targetAccountId = match.id;
            }
          } catch {
            // ignore account lookup errors; we'll fallback to currentAccount
          }
        }

        await loadAccount(password, targetAccountId);
        onAccountSelected();
      } catch (error) {
        console.error('Password authentication failed:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Invalid password. Please try again.';
        // Set error in parent component so it persists across re-renders
        onErrorChange?.(errorMessage);
        setPassword(''); // Clear password on error
      } finally {
        setIsLoading(false);
      }
    };

    const handleChangeAccount = () => {
      setShowAccountSelection(true);
    };

    const handleAccountSelected = (account: UserProfile) => {
      setSelectedAccountInfo(account);
      // Persist selection globally to survive remounts
      globalSelectedAccountId = account.id ?? null;
      globalSelectedUsername = account.username ?? null;
      setShowAccountSelection(false);
      // Clear any previous errors and password
      onErrorChange?.(null);
      setPassword('');
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

    // Show biometric CTA whenever account supports WebAuthn, regardless of platform flags
    const accountSupportsBiometrics = !usePassword;

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
              Welcome Back!
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Hello,{' '}
              <span className="font-semibold">
                {(currentAccount || userProfile)?.username}
              </span>
            </p>
          </div>

          {/* Authentication Section */}
          <div className="space-y-6">
            {/* Biometric Authentication */}
            {accountSupportsBiometrics && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-blue-600 dark:text-blue-400"
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
                  <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">
                    Use Biometric Authentication
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">
                    Sign in with your fingerprint, face ID, or Windows Hello
                  </p>
                  {platformResolved &&
                    (!webauthnSupported || !platformAuthenticatorAvailable) && (
                      <p className="text-xs text-blue-800 dark:text-blue-400 mb-3">
                        Biometric support not detected on this device. We will
                        try anyway.
                      </p>
                    )}
                  <button
                    onClick={handleBiometricAuth}
                    disabled={isLoading}
                    className="w-full h-12 bg-blue-600 dark:bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-black dark:text-white mb-4">
                  Enter Your Password
                </h3>
                <div className="space-y-4">
                  <div>
                    <input
                      type="password"
                      value={password}
                      onChange={e => {
                        setPassword(e.target.value);
                        // Clear error when user starts typing again
                        if (passwordError && onErrorChange) {
                          onErrorChange(null);
                        }
                      }}
                      onKeyDown={e => {
                        if (
                          e.key === 'Enter' &&
                          password.trim() &&
                          !isLoading
                        ) {
                          handlePasswordAuth();
                        }
                      }}
                      placeholder="Enter your password"
                      className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-all text-black dark:text-white bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 ${
                        passwordError
                          ? 'border-red-500 dark:border-red-600 focus:border-red-600 dark:focus:border-red-500 animate-shake'
                          : 'border-gray-200 dark:border-gray-600 focus:border-gray-400 dark:focus:border-gray-500'
                      }`}
                      disabled={isLoading}
                    />
                  </div>
                  <button
                    onClick={handlePasswordAuth}
                    disabled={isLoading || !password.trim()}
                    className="w-full h-12 rounded-lg text-sm font-medium transition-colors duration-200 bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin"></div>
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
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400 text-sm">
                  {error}
                </p>
              </div>
            )}

            {/* Account Options */}
            <div className="space-y-3">
              <button
                onClick={handleChangeAccount}
                className="w-full h-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Change Account
              </button>
              <button
                onClick={onCreateNewAccount}
                className="w-full h-12 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium text-black dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Create New Account
              </button>
              <button
                onClick={() => setShowAccountImport(true)}
                className="w-full h-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Import Account
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

WelcomeBack.displayName = 'WelcomeBack';

export default WelcomeBack;
