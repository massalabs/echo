import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useAccountStore } from './stores/accountStore';
import { useAppStore } from './stores/appStore';
import { db, UserProfile } from './db';
import OnboardingFlow from './components/OnboardingFlow';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router-dom';
import ErrorBoundary from './components/ui/ErrorBoundary.tsx';
import PWABadge from './PWABadge.tsx';
import DebugOverlay from './components/ui/DebugOverlay.tsx';
import { addDebugLog } from './components/ui/debugLogs';
import AccountImport from './components/account/AccountImport.tsx';
import { backgroundSyncService } from './services/backgroundSync';
import { setupServiceWorker } from './services/serviceWorkerSetup';
import { Toaster } from 'react-hot-toast';
import { PrivacyGraphic } from './components/ui/PrivacyGraphic';
import './App.css';

// Route components and helpers
import Login from './pages/Login.tsx';
import AccountCreation from './components/account/AccountCreation.tsx';
import MainLayout from './components/ui/MainLayout.tsx';
import Discussions from './pages/Discussions';
import Contact from './pages/Contact';
import Discussion from './pages/Discussion';
import NewDiscussion from './pages/NewDiscussion';
import NewContact from './pages/NewContact';
import Settings from './pages/Settings';
import Wallet from './pages/Wallet';

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const { isInitialized, isLoading, setLoading, userProfile } =
    useAccountStore();
  const [showImport, setShowImport] = useState(false);
  const [existingAccountInfo, setExistingAccountInfo] =
    useState<UserProfile | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const hasAuthenticatedRef = useRef(false);

  addDebugLog(
    `AppContent render: init=${isInitialized}, loading=${isLoading}, hasProfile=${!!userProfile}`
  );

  // Load profile from Dexie on app start
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      // Add a small delay to ensure database is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const state = useAccountStore.getState();
      const profile =
        state.userProfile || (await db.userProfile.toCollection().first());

      if (profile) {
        // Profile exists - let DiscussionList handle the welcome flow
        useAccountStore.setState({ isInitialized: true });
      } else {
        // No profile exists - show onboarding
        useAccountStore.setState({ isInitialized: false });
      }
    } catch (error) {
      console.error('Error loading user profile from Dexie:', error);
      // On error, assume no profile exists
      useAccountStore.setState({ isInitialized: false });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  useEffect(() => {
    loadProfile();

    // Initialize background sync service
    backgroundSyncService.initialize().catch(error => {
      console.error('Failed to initialize background sync:', error);
    });

    // Setup service worker: register, listen for messages, and start sync scheduler
    setupServiceWorker().catch(error => {
      console.error('Failed to setup service worker:', error);
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Trigger message sync when user logs in (when userProfile is available)
  useEffect(() => {
    if (userProfile?.userId) {
      // Latch authenticated state to avoid transient flicker of unauth routes
      hasAuthenticatedRef.current = true;
      console.log('User logged in, triggering message sync');
      backgroundSyncService.triggerManualSync().catch(error => {
        console.error('Failed to sync messages on login:', error);
      });
    }
  }, [userProfile?.userId]);

  // Separate effect: refresh full app state (announcements, messages, discussions, contacts)
  useEffect(() => {
    if (userProfile?.userId) {
      const { refreshAppState } = useAppStore.getState();

      // Initial refresh on login
      refreshAppState().catch(error => {
        console.error('Failed to refresh app state on login:', error);
      });

      // Set up periodic refresh every 10 seconds
      const refreshInterval = setInterval(() => {
        console.log('Periodic app state refresh triggered (every 10s)');
        refreshAppState().catch(error => {
          console.error('Failed to refresh app state periodically:', error);
        });
      }, 10000); // 10 seconds

      // Cleanup interval when user logs out or component unmounts
      return () => {
        clearInterval(refreshInterval);
        console.log('Periodic app state refresh interval cleared');
      };
    }
  }, [userProfile?.userId]);

  // Load existing account info to show username in WelcomeBack when unauthenticated
  useEffect(() => {
    (async () => {
      try {
        if (isInitialized && !userProfile) {
          const info = await useAccountStore
            .getState()
            .getExistingAccountInfo();
          setExistingAccountInfo(info);
        }
      } catch (_e) {
        setExistingAccountInfo(null);
      }
    })();
  }, [isInitialized, userProfile]);

  // Ensure we default to /welcome if hash is empty when unauthenticated
  useEffect(() => {
    // Skip redirect if we've ever been authenticated in this session
    if (hasAuthenticatedRef.current) return;
    if (isInitialized && !userProfile && !isLoading) {
      const currentPath = window.location.hash.slice(1) || '/';
      if (currentPath === '/' || currentPath === '') {
        navigate('/welcome', { replace: true });
      }
    }
  }, [isInitialized, userProfile, isLoading, navigate]);

  // Show global loader only during initial boot, not during sign-in.
  if (isLoading && !isInitialized && !userProfile) {
    return (
      <div className="min-h-screen-mobile bg-background flex items-center justify-center">
        <div className="text-center">
          <PrivacyGraphic size={120} loading={true} />
          <p className="text-sm text-muted-foreground mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  // If authenticated (current or latched), show main app routes
  if (userProfile || hasAuthenticatedRef.current) {
    return (
      <Routes>
        <Route path="/new-discussion" element={<NewDiscussion />} />
        <Route path="/new-contact" element={<NewContact />} />
        <Route path="/contact/:userId" element={<Contact />} />
        <Route path="/discussion/:userId" element={<Discussion />} />
        <Route
          path="/wallet"
          element={
            <MainLayout>
              <Wallet />
            </MainLayout>
          }
        />
        <Route
          path="/settings"
          element={
            <MainLayout>
              <Settings />
            </MainLayout>
          }
        />
        <Route
          path="/"
          element={
            <MainLayout>
              <Discussions />
            </MainLayout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // If not initialized and no profile, show onboarding
  if (!isInitialized) {
    if (showImport) {
      return (
        <AccountImport
          onBack={() => setShowImport(false)}
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
        onImportMnemonic={() => setShowImport(true)}
      />
    );
  }
  // Initialized but unauthenticated: route between Login and Setup

  return (
    <Routes>
      <Route
        path="/welcome"
        element={
          <Login
            key="login-router"
            onCreateNewAccount={() => {
              setLoginError(null); // Clear error when navigating to setup
              navigate('/setup');
            }}
            onAccountSelected={() => {
              // Only navigate if userProfile is actually set (successful login)
              // The route will automatically update when userProfile changes
              setLoginError(null); // Clear error on successful login
            }}
            accountInfo={existingAccountInfo}
            persistentError={loginError}
            onErrorChange={setLoginError}
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

function App() {
  return (
    <HashRouter>
      <ErrorBoundary>
        <AppContent />
        <DebugOverlay />
        <div className="hidden">
          <PWABadge />
        </div>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#4ade80',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </ErrorBoundary>
    </HashRouter>
  );
}

export default App;
