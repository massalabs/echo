import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountStore } from '../stores/accountStore';

/**
 * Hook to handle authentication-based routing
 * Redirects to /welcome if hash is empty when unauthenticated
 * Uses a ref to prevent redirect flicker during logout transitions
 */
export function useAuthRouting() {
  const navigate = useNavigate();
  const { isInitialized, userProfile, isLoading } = useAccountStore();
  const wasAuthenticatedRef = useRef(false);

  // Track if user was ever authenticated to prevent redirect during logout
  useEffect(() => {
    if (userProfile?.userId) {
      wasAuthenticatedRef.current = true;
    }
  }, [userProfile?.userId]);

  // Ensure we default to /welcome if hash is empty when unauthenticated
  // Skip redirect if user was authenticated (prevents flicker during logout)
  useEffect(() => {
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
  }, [isInitialized, userProfile, isLoading, navigate]);
}
