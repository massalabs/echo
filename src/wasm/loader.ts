/**
 * WASM Module Loader
 *
 * This file handles loading and initialization of WASM modules.
 * Currently uses mock implementations, but can be easily updated
 * to load actual WASM modules when they become available.
 */

import { WasmModule, SessionModule } from './types';
import { MockSessionModule } from './session';

export class WasmModuleLoader {
  private modules: Map<string, WasmModule> = new Map();
  private initialized = false;

  async loadModules(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load session and user ID modules
      const sessionModule = await this.loadSessionModule();

      this.modules.set('session', sessionModule);

      // Initialize the modules
      await sessionModule.init();

      this.initialized = true;
    } catch (error) {
      console.error('Failed to load WASM modules:', error);
      throw new Error('WASM module loading failed');
    }
  }

  private async loadSessionModule(): Promise<SessionModule> {
    // In a real implementation, this would load the actual WASM module
    // For now, we'll return a mock implementation
    return new MockSessionModule();
  }

  getModule<T extends WasmModule>(name: string): T {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`Module ${name} not found`);
    }
    return module as T;
  }

  async cleanup(): Promise<void> {
    for (const module of this.modules.values()) {
      module.cleanup();
    }
    this.modules.clear();
    this.initialized = false;
  }
}

// Global WASM module instance
export const wasmLoader = new WasmModuleLoader();
