/**
 * WASM Module Loader and Initialization Service
 *
 * This file handles both WASM core initialization and module loading.
 * It ensures WASM modules are initialized once and properly throughout
 * the application lifecycle.
 */

import init from '../assets/generated/wasm/echo_wasm';
import { SessionModule } from './session';

/**
 * WASM Initialization State
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
      await init();
      isInitialized = true;
      isInitializing = false;
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

/**
 * Get or create the session module
 */
let sessionModuleInstance: SessionModule | null = null;

export async function getSessionModule(): Promise<SessionModule> {
  if (sessionModuleInstance) {
    return sessionModuleInstance;
  }

  // Ensure WASM core is initialized
  await ensureWasmInitialized();

  // Create and initialize the session module
  sessionModuleInstance = new SessionModule();
  await sessionModuleInstance.init();

  return sessionModuleInstance;
}

/**
 * Cleanup WASM modules
 */
export async function cleanupWasmModules(): Promise<void> {
  if (sessionModuleInstance) {
    sessionModuleInstance.cleanup();
    sessionModuleInstance = null;
  }
}
