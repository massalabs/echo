import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountStore } from '../stores/accountStore';

/**
 * Hook to handle authentication-based routing
 * - Latches authenticated state to avoid transient flicker of unauth routes
 * - Redirects to /welcome if hash is empty when unauthenticated
 */
export function useAuthRouting() {
  const navigate = useNavigate();
  const { isInitialized, userProfile, isLoading } = useAccountStore();
  const hasAuthenticatedRef = useRef(false);

  // Latch authenticated state to avoid transient flicker of unauth routes
  useEffect(() => {
    if (userProfile?.userId) {
      hasAuthenticatedRef.current = true;
    }
  }, [userProfile?.userId]);

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

  return { hasAuthenticatedRef };
}
