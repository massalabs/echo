/**
 * WebAssembly integration exports
 */

export {
  initializeWasm,
  testWasm,
  testUserKeys,
  isWasmInitialized,
} from './wasmSetup';
export { runWasmTests, quickWasmTest, testWasmFromReact } from './test';
export { WasmTestComponent } from './WasmTestComponent';
