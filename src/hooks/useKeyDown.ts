import { useEffect, useRef, useCallback } from 'react';

interface UseKeyDownOptions {
  enabled?: boolean;
}

interface UseKeyDownReturn {
  onEnter: (callback: () => void) => void;
  onEsc: (callback: () => void) => void;
  removeOnEnter: () => void;
  removeOnEsc: () => void;
}

/**
 * Custom hook for handling keyboard events (Enter and Escape keys)
 *
 * @param options - Configuration options
 * @param options.enabled - Whether the keyboard listeners are active (default: true)
 * @returns Object with onEnter, onEsc, removeOnEnter, and removeOnEsc functions
 *
 * @example
 * ```tsx
 * const { onEnter, onEsc } = useKeyDown({ enabled: isOpen });
 *
 * useEffect(() => {
 *   onEnter(() => handleConfirm());
 *   onEsc(() => handleClose());
 * }, [onEnter, onEsc]);
 * ```
 */
export const useKeyDown = (
  options: UseKeyDownOptions = {}
): UseKeyDownReturn => {
  const { enabled = true } = options;

  const enterCallbackRef = useRef<(() => void) | null>(null);
  const escCallbackRef = useRef<(() => void) | null>(null);

  const onEnter = useCallback((callback: () => void) => {
    enterCallbackRef.current = callback;
  }, []);

  const onEsc = useCallback((callback: () => void) => {
    escCallbackRef.current = callback;
  }, []);

  const removeOnEnter = useCallback(() => {
    enterCallbackRef.current = null;
  }, []);

  const removeOnEsc = useCallback(() => {
    escCallbackRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape key
      if (e.key === 'Escape' && escCallbackRef.current) {
        e.preventDefault();
        escCallbackRef.current();
        return;
      }

      // Handle Enter key
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        enterCallbackRef.current
      ) {
        // Only trigger if not already on a button to avoid double triggering
        if (!(document.activeElement instanceof HTMLButtonElement)) {
          e.preventDefault();
          enterCallbackRef.current();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled]);

  return {
    onEnter,
    onEsc,
    removeOnEnter,
    removeOnEsc,
  };
};
