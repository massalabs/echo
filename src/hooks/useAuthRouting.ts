import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountStore } from '../stores/accountStore';

/**
 * Hook to handle authentication-based routing
 * Redirects to /welcome if hash is empty when unauthenticated
 */
export function useAuthRouting() {
  const navigate = useNavigate();
  const { isInitialized, userProfile, isLoading } = useAccountStore();

  // Ensure we default to /welcome if hash is empty when unauthenticated
  useEffect(() => {
    if (isInitialized && !userProfile && !isLoading) {
      const currentPath = window.location.hash.slice(1) || '/';
      if (currentPath === '/' || currentPath === '') {
        navigate('/welcome', { replace: true });
      }
    }
  }, [isInitialized, userProfile, isLoading, navigate]);
}
