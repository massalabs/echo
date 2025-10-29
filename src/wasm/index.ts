/**
 * WASM Module Exports
 *
 * This file provides a clean interface for importing WASM modules
 * and related functionality.
 */

// Export modules
export { SessionModule } from './session';

// Export initialization functions and session module
export {
  initializeWasm,
  ensureWasmInitialized,
  startWasmInitialization,
  getInitializationStatus,
  getInitializationPromise,
  getSessionModule,
  cleanupWasmModules,
} from './loader';

// Export specialized WASM functionality
export * from './encryption';
export * from './userKeys';
