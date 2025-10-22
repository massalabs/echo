/**
 * React component to test WASM integration
 */

import React, { useState } from 'react';
import { testWasmFromReact, quickWasmTest } from './test';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

export const WasmTestComponent: React.FC = () => {
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [quickTestResult, setQuickTestResult] = useState<boolean | null>(null);

  const runFullTest = async () => {
    setIsLoading(true);
    try {
      const result = await testWasmFromReact();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: `Test failed: ${error}`,
        details: { error: String(error) },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runQuickTest = async () => {
    try {
      const result = await quickWasmTest();
      setQuickTestResult(result);
    } catch (error) {
      console.error('Quick test failed:', error);
      setQuickTestResult(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">WebAssembly Integration Test</h2>

      <div className="space-y-4">
        <div>
          <button
            onClick={runFullTest}
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            {isLoading ? 'Testing...' : 'Run Full WASM Test'}
          </button>
        </div>

        <div>
          <button
            onClick={runQuickTest}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Run Quick Test
          </button>
        </div>

        {testResult && (
          <div
            className={`p-4 rounded ${testResult.success ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'} border`}
          >
            <h3 className="font-bold">
              {testResult.success ? '✅ Test Passed' : '❌ Test Failed'}
            </h3>
            <p className="text-sm">{testResult.message}</p>
            {testResult.details && (
              <pre className="text-xs mt-2 bg-gray-100 p-2 rounded overflow-auto">
                {JSON.stringify(testResult.details, null, 2)}
              </pre>
            )}
          </div>
        )}

        {quickTestResult !== null && (
          <div
            className={`p-4 rounded ${quickTestResult ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'} border`}
          >
            <h3 className="font-bold">
              {quickTestResult
                ? '✅ Quick Test Passed'
                : '❌ Quick Test Failed'}
            </h3>
            <p className="text-sm">Quick WASM functionality test</p>
          </div>
        )}
      </div>
    </div>
  );
};
