import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountStore } from '../stores/accountStore';

/**
 * Hook to handle authentication-based routing
 * Redirects to /welcome if hash is empty when unauthenticated
 * Uses a ref to prevent redirect flicker during logout transitions
 *
 * Optimized to use specific selectors to prevent unnecessary rerenders
 */
export function useAuthRouting() {
  const navigate = useNavigate();
  // Use specific selectors to only subscribe to what we need
  // This prevents rerenders when other account store values change
  const isInitialized = useAccountStore(s => s.isInitialized);
  const userProfile = useAccountStore(s => s.userProfile);
  const isLoading = useAccountStore(s => s.isLoading);
  const wasAuthenticatedRef = useRef(false);

  // Track if user was ever authenticated to prevent redirect during logout
  const userId = userProfile?.userId;
  useEffect(() => {
    if (userId) {
      wasAuthenticatedRef.current = true;
    }
  }, [userId]);

  // Ensure we default to /welcome if hash is empty when unauthenticated
  // Also handle logout: navigate to /welcome when user logs out
  useEffect(() => {
    // If user was authenticated but now isn't (logout happened)
    if (wasAuthenticatedRef.current && !userProfile && !isLoading) {
      // Navigate to /welcome after logout
      navigate('/welcome', { replace: true });
      // Reset the ref after navigation
      wasAuthenticatedRef.current = false;
      return;
    }

    // Default redirect to /welcome for unauthenticated users (first time users)
    if (
      isInitialized &&
      !userProfile &&
      !isLoading &&
      !wasAuthenticatedRef.current
    ) {
      const currentPath = window.location.hash.slice(1) || '/';
      if (currentPath === '/' || currentPath === '') {
        navigate('/welcome', { replace: true });
      }
    }

    // Reset ref when user is fully logged out (no accounts remain)
    if (!isInitialized && !userProfile) {
      wasAuthenticatedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, userProfile, isLoading]); // Removed navigate from deps - it's stable
}
