/**
 * WASM Module Exports
 *
 * This file provides a clean interface for importing WASM modules
 * and related functionality.
 */

// Export types
export * from './types';

// Export modules
export { MockSessionModule } from './session';

// Export loader
export { WasmModuleLoader, wasmLoader } from './loader';

// Export initializer
export {
  initializeWasm,
  ensureWasmInitialized,
  generateUserKeys,
  startWasmInitialization,
  getInitializationStatus,
  getInitializationPromise,
} from './initializer';
