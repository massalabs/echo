import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccountStore } from '../stores/accountStore';
import { UserProfile } from '../db';
import AccountSelection from '../components/account/AccountSelection';
import AccountImport from '../components/account/AccountImport';
import Button from '../components/ui/Button';

interface LoginProps {
  onCreateNewAccount: () => void;
  onAccountSelected: () => void;
  accountInfo?: UserProfile | null;
  persistentError?: string | null;
  onErrorChange?: (error: string | null) => void;
}

const Login: React.FC<LoginProps> = React.memo(
  ({
    onCreateNewAccount,
    onAccountSelected,
    accountInfo,
    persistentError = null,
    onErrorChange,
  }) => {
    const loadAccount = useAccountStore(state => state.loadAccount);
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

    const currentAccount = selectedAccountInfo || accountInfo;

    useEffect(() => {
      const shouldUsePassword =
        !currentAccount?.security?.webauthn?.credentialId;
      if (usePassword !== shouldUsePassword) {
        setUsePassword(shouldUsePassword);
      }
    }, [currentAccount, usePassword]);

    useEffect(() => {
      if (platformResolved) return;
      (async () => {
        try {
          await checkPlatformAvailability();
        } catch {
          // ignore
        } finally {
          setPlatformResolved(true);
        }
      })();
    }, [checkPlatformAvailability, platformResolved]);

    const handleBiometricAuth = useCallback(async () => {
      try {
        setIsLoading(true);
        onErrorChange?.(null);

        await loadAccount(undefined, currentAccount?.userId);
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
    }, [currentAccount, onErrorChange, loadAccount, onAccountSelected]);

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

        await loadAccount(password, currentAccount?.userId);

        const state = useAccountStore.getState();
        if (state.userProfile) {
          onAccountSelected();
        } else {
          throw new Error('Failed to load account');
        }
      } catch (error) {
        console.error('Password authentication failed:', error);
        const errorMessage = 'Invalid password. Please try again.';
        onErrorChange?.(errorMessage);
        setPassword('');
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
      setShowAccountSelection(false);
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

    const accountSupportsBiometrics = !usePassword;
    const displayUsername = currentAccount?.username;

    if (showAccountSelection) {
      return (
        <AccountSelection
          onBack={handleBackFromSelection}
          onCreateNewAccount={onCreateNewAccount}
          onAccountSelected={handleAccountSelected}
        />
      );
    }

    if (showAccountImport) {
      return (
        <AccountImport
          onBack={handleBackFromImport}
          onComplete={handleImportComplete}
        />
      );
    }

    return (
      <div className="bg-background flex flex-col items-center justify-center p-6 h-full">
        <div className="w-full max-w-sm mx-auto">
          <div className="text-center mb-8">
            <img
              src="/logo.svg"
              alt="Gossip"
              className="mx-auto my-10 w-11/12 h-auto dark:invert"
            />
            <h1 className="mt-4 text-[28px] font-semibold tracking-tight text-gray-900 dark:text-white">
              {displayUsername ? (
                <>
                  Welcome back,{' '}
                  <span className="text-blue-700 dark:text-blue-400  text-4xl">
                    {displayUsername}
                  </span>
                </>
              ) : (
                'Welcome to Gossip'
              )}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Sign in quickly and securely.
            </p>
          </div>

          <div className="space-y-5">
            {accountSupportsBiometrics && (
              <div className="rounded-2xl bg-white/80 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-700/60 p-4 shadow-sm backdrop-blur">
                <div className="space-y-3">
                  <Button
                    onClick={handleBiometricAuth}
                    disabled={isLoading}
                    loading={isLoading}
                    variant="primary"
                    size="custom"
                    fullWidth
                    className="h-11 rounded-xl text-sm font-medium"
                  >
                    {!isLoading && <span>Sign in with biometrics</span>}
                  </Button>
                  {platformResolved &&
                    (!webauthnSupported || !platformAuthenticatorAvailable) && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Biometrics not detected. We will try anyway.
                      </p>
                    )}
                </div>
              </div>
            )}

            {usePassword && (
              <div className="rounded-2xl bg-white/80 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-700/60 p-4 shadow-sm backdrop-blur">
                <div className="space-y-3">
                  <input
                    type="password"
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value);
                      if (persistentError && onErrorChange) {
                        onErrorChange(null);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && password.trim() && !isLoading) {
                        e.preventDefault();
                        handlePasswordAuth(e);
                      }
                    }}
                    placeholder="Password"
                    className={`w-full h-12 px-4 rounded-xl border text-sm focus:outline-none focus:ring-2 transition text-gray-900 dark:text-white bg-white dark:bg-gray-800 ${
                      persistentError
                        ? 'border-red-300 dark:border-red-600 focus:ring-red-200 dark:focus:ring-red-900/40'
                        : 'border-gray-200 dark:border-gray-700 focus:ring-blue-200 dark:focus:ring-blue-900/40'
                    }`}
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    onClick={() => handlePasswordAuth()}
                    disabled={isLoading || !password.trim()}
                    loading={isLoading}
                    variant="primary"
                    size="custom"
                    fullWidth
                    className="h-11 rounded-xl text-sm font-medium"
                  >
                    Sign in
                  </Button>
                </div>
              </div>
            )}

            {persistentError && (
              <div className="rounded-xl border-2 border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-900/20 p-3">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {persistentError}
                </p>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <Button
                onClick={handleChangeAccount}
                variant="outline"
                size="custom"
                fullWidth
                className="h-10 rounded-xl text-sm"
              >
                Switch account
              </Button>
              <Button
                onClick={onCreateNewAccount}
                variant="outline"
                size="custom"
                fullWidth
                className="h-10 rounded-xl text-sm"
              >
                Create new account
              </Button>
              <Button
                onClick={() => setShowAccountImport(true)}
                variant="outline"
                size="custom"
                fullWidth
                className="h-10 rounded-xl text-sm"
              >
                Import account
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

Login.displayName = 'Login';

export default Login;
