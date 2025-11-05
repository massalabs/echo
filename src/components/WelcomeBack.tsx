import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { UserProfile } from '../db';
import AccountSelection from './account/AccountSelection';
import AccountImport from './account/AccountImport';
import Button from './ui/Button';

// Persist the last selected account across re-renders/remounts
let globalSelectedAccountId: string | null = null;
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
    ) as unknown as (userId?: string) => Promise<void>;
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
              match =
                all.find(a => a.userId === globalSelectedAccountId) || null;
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
        let targetAccountId = account?.userId ?? null;
        if (targetAccountId == null && account?.username) {
          try {
            const all = await getAllAccounts();
            const match = all.find(a => a.username === account.username);
            if (match?.userId != null) {
              targetAccountId = match.userId;
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

    const handlePasswordAuth = async (
      e?: React.MouseEvent | React.KeyboardEvent
    ) => {
      // Prevent any form submission or navigation
      e?.preventDefault();
      e?.stopPropagation();

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
        let targetAccountId = account?.userId;
        if (targetAccountId == null && account?.username) {
          try {
            const all = await getAllAccounts();
            const match = all.find(a => a.username === account.username);
            if (match?.userId != null) {
              targetAccountId = match.userId;
            }
          } catch {
            // ignore account lookup errors; we'll fallback to currentAccount
          }
        }

        await loadAccount(password, targetAccountId);
        // Verify that userProfile was actually set before calling onAccountSelected
        // Give it a tiny moment for the store to update
        await new Promise(resolve => setTimeout(resolve, 50));
        const state = useAccountStore.getState();
        if (state.userProfile) {
          onAccountSelected();
        } else {
          // If userProfile wasn't set, treat it as an error
          throw new Error('Failed to load account');
        }
      } catch (error) {
        console.error('Password authentication failed:', error);
        // Show user-friendly error message regardless of the technical error
        const errorMessage = 'Invalid password. Please try again.';
        // Set error in parent component so it persists across re-renders
        onErrorChange?.(errorMessage);
        setPassword(''); // Clear password on error
        // Ensure we stay on the welcome page - don't navigate away on error
        if (window.location.hash !== '#/welcome') {
          window.location.hash = '#/welcome';
        }
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
      globalSelectedAccountId = account.userId ?? null;
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
      <div className="min-h-screen-mobile bg-linear-to-br from-blue-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md mx-auto">
          {/* Logo and Welcome Section */}
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">
              Welcome back {(currentAccount || userProfile)?.username || 'User'}
            </h1>
          </div>

          {/* Authentication Section */}
          <div className="space-y-4">
            {/* Biometric Authentication */}
            {accountSupportsBiometrics && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-200">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-emerald-600 dark:from-emerald-500 dark:to-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
                    <svg
                      className="w-8 h-8 text-white"
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
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Quick Sign In 🔐
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                    Use your fingerprint, face ID, or Windows Hello for instant
                    access
                  </p>
                  {platformResolved &&
                    (!webauthnSupported || !platformAuthenticatorAvailable) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mb-4 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        Biometric support not detected. We will try anyway.
                      </p>
                    )}
                  <Button
                    onClick={handleBiometricAuth}
                    disabled={isLoading}
                    loading={isLoading}
                    variant="gradient-emerald"
                    size="custom"
                    fullWidth
                    className="h-[54px] text-base font-semibold rounded-xl flex items-center justify-center gap-2"
                  >
                    {!isLoading && (
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
                            strokeWidth={2.5}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        <span>Sign In with Biometrics</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Password Authentication */}
            {usePassword && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-lg">
                <div className="text-center mb-5">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 dark:from-blue-500 dark:to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
                    <svg
                      className="w-7 h-7 text-white"
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
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                    Password Sign In 🔑
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Enter your password to access your account
                  </p>
                </div>
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
                          e.preventDefault();
                          handlePasswordAuth(e);
                        }
                      }}
                      placeholder="Enter your password"
                      className={`w-full h-12 px-4 rounded-xl border-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all text-gray-900 dark:text-white bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 ${
                        passwordError
                          ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-500 focus:ring-red-500/20'
                          : 'border-gray-200 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-blue-500/20'
                      }`}
                      disabled={isLoading}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => handlePasswordAuth()}
                    disabled={isLoading || !password.trim()}
                    loading={isLoading}
                    variant="gradient-blue"
                    size="custom"
                    fullWidth
                    className="h-[54px] text-base font-semibold rounded-xl flex items-center justify-center gap-2"
                  >
                    {!isLoading && (
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
                            strokeWidth={2.5}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        <span>Sign In</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <svg
                    className="w-5 h-5 text-red-500 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* Account Options */}
            <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button
                onClick={handleChangeAccount}
                variant="outline"
                size="custom"
                fullWidth
                className="h-12 rounded-xl text-sm font-semibold"
              >
                Switch Account
              </Button>
              <Button
                onClick={onCreateNewAccount}
                variant="outline"
                size="custom"
                fullWidth
                className="h-12 rounded-xl text-sm font-semibold"
              >
                Create New Account
              </Button>
              <Button
                onClick={() => setShowAccountImport(true)}
                variant="outline"
                size="custom"
                fullWidth
                className="h-12 rounded-xl text-sm font-semibold"
              >
                Import Account
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

WelcomeBack.displayName = 'WelcomeBack';

export default WelcomeBack;
