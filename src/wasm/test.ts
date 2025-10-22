/**
 * Test file for WebAssembly integration
 * This file demonstrates how to use the WASM functions
 */

import { initializeWasm, testWasm, testUserKeys, isWasmInitialized } from './wasmSetup';

/**
 * Run all WASM tests
 */
export async function runWasmTests(): Promise<void> {
  console.log('🚀 Starting WASM tests...');
  
  try {
    // Step 1: Initialize WASM
    console.log('\n📦 Step 1: Initializing WASM...');
    await initializeWasm();
    
    if (!isWasmInitialized()) {
      throw new Error('WASM initialization failed');
    }
    console.log('✅ WASM initialized successfully');
    
    // Step 2: Test basic WASM functionality
    console.log('\n🧪 Step 2: Testing basic WASM functionality...');
    const basicTestPassed = await testWasm();
    if (!basicTestPassed) {
      throw new Error('Basic WASM test failed');
    }
    console.log('✅ Basic WASM test passed');
    
    // Step 3: Test user key generation
    console.log('\n🔑 Step 3: Testing user key generation...');
    await testUserKeys('test-passphrase-123');
    console.log('✅ User key generation test passed');
    
    console.log('\n🎉 All WASM tests passed successfully!');
    
  } catch (error) {
    console.error('\n❌ WASM tests failed:', error);
    throw error;
  }
}

/**
 * Simple test that can be called from React components
 */
export async function quickWasmTest(): Promise<boolean> {
  try {
    console.log('⚡ Quick WASM test...');
    
    // Initialize if not already done
    if (!isWasmInitialized()) {
      await initializeWasm();
    }
    
    // Run basic test
    const result = await testWasm();
    
    if (result) {
      console.log('✅ Quick WASM test passed');
    } else {
      console.log('❌ Quick WASM test failed');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Quick WASM test error:', error);
    return false;
  }
}

/**
 * Test WASM integration from a React component
 * This is how you would use it in your React app
 */
export async function testWasmFromReact(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  try {
    console.log('⚛️ Testing WASM from React context...');
    
    // Initialize WASM
    await initializeWasm();
    
    // Test basic functionality
    const basicTest = await testWasm();
    
    if (basicTest) {
      return {
        success: true,
        message: 'WASM integration working correctly',
        details: {
          initialized: isWasmInitialized(),
          basicTest: basicTest
        }
      };
    } else {
      return {
        success: false,
        message: 'WASM basic test failed'
      };
    }
    
  } catch (error) {
    return {
      success: false,
      message: `WASM test failed: ${error}`,
      details: { error: error instanceof Error ? error.message : String(error) }
    };
  }
}

// Export for easy importing
export { initializeWasm, testWasm, testUserKeys, isWasmInitialized };

