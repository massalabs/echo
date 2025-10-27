/**
 * WASM Initialization Service
 *
 * Centralized WASM module initialization logic.
 * This service ensures WASM modules are initialized once and properly
 * throughout the application lifecycle.
 */

import init, {
  generate_user_keys as _generate_user_keys,
} from '../assets/wasm/echo_wasm';
import type { UserKeys } from '../assets/wasm/echo_wasm';

/**
 * Initialization state
 */
let isInitializing = false;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
let initError: Error | null = null;

/**
 * Get the initialization status
 */
export function getInitializationStatus() {
  return {
    isInitialized,
    isInitializing,
    hasError: !!initError,
    error: initError,
  };
}

/**
 * Initialize WASM modules if not already initialized
 * This function is idempotent - safe to call multiple times
 */
export async function initializeWasm(): Promise<void> {
  // If already initialized, return immediately
  if (isInitialized) {
    return;
  }

  // If initialization is in progress, wait for it to complete
  if (isInitializing && initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  isInitializing = true;
  initError = null;

  initializationPromise = (async () => {
    try {
      console.log('[WASM] Initializing WASM modules...');
      await init();
      isInitialized = true;
      isInitializing = false;
      console.log('[WASM] WASM modules initialized successfully');
    } catch (error) {
      initError = error as Error;
      isInitializing = false;
      console.error('[WASM] Failed to initialize WASM modules:', error);
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Ensure WASM is initialized, throwing an error if initialization failed
 */
export async function ensureWasmInitialized(): Promise<void> {
  await initializeWasm();

  if (initError) {
    throw new Error(`WASM initialization failed: ${initError.message}`);
  }

  if (!isInitialized) {
    throw new Error('WASM not initialized');
  }
}

/**
 * Generate user keys (proxy to WASM function)
 * This ensures WASM is initialized before calling
 */
export async function generateUserKeys(
  passphrase: string,
  secondaryKey: Uint8Array
): Promise<UserKeys> {
  await ensureWasmInitialized();
  // The actual WASM function is synchronous, so we can call it directly
  const keys = _generate_user_keys(passphrase, secondaryKey);
  return keys;
}

/**
 * Start WASM initialization in the background
 * This should be called early in the app lifecycle (e.g., in main.tsx)
 */
export function startWasmInitialization(): void {
  // Fire and forget - start initialization in background
  initializeWasm().catch(error => {
    console.error('[WASM] Background initialization error:', error);
  });
}

/**
 * Get initialization promise (for components that need to wait)
 */
export function getInitializationPromise(): Promise<void> {
  if (isInitialized) {
    return Promise.resolve();
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  // If no initialization has started yet, start it now
  return initializeWasm();
}
