import { useCallback, useMemo, useState } from 'react';
import { MRC20, Provider, Operation, Address } from '@massalabs/massa-web3';
import { useHandleOperation } from './useHandleOperation';
import { Asset, OperationError } from './types';

export interface AllowanceParams {
  spender: string;
  amount: bigint;
  token: Asset;
  final: boolean;
}

export interface UseAllowanceOptions {
  provider: Provider | null;
}

export function useAllowance(options: UseAllowanceOptions) {
  const { provider } = options;
  const {
    handleOperation,
    error: operationError,
    operation,
  } = useHandleOperation();

  const [state, setState] = useState<{
    isPending: boolean;
    error: OperationError | null;
  }>({
    isPending: false,
    error: null,
  });

  /**
   * Executes an allowance operation (increase or decrease)
   * @param allowanceFn - The function to modify the allowance
   * @param params - Parameters for the allowance operation
   * @returns void
   */
  const execute = useCallback(
    async (
      allowanceFn: () => Promise<Operation>,
      params: AllowanceParams
    ): Promise<void> => {
      const { spender, amount, token, final } = params;
      setState(prev => ({ ...prev, isPending: true }));

      try {
        // Validate spender address
        Address.fromString(spender);
      } catch {
        setState(prev => ({
          ...prev,
          error: { message: 'Invalid spender address' },
        }));
        return;
      }

      if (!token.address) {
        setState(prev => ({
          ...prev,
          error: { message: 'Token address required' },
        }));
        return;
      }

      if (amount <= 0n) {
        setState(prev => ({
          ...prev,
          error: { message: 'Amount must be greater than zero' },
        }));
        return;
      }

      try {
        await handleOperation(await allowanceFn(), { final });

        if (operationError) {
          setState(prev => ({ ...prev, error: operationError }));
          return;
        }

        setState(prev => ({ ...prev, isPending: false, error: null }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: {
            message: `Failed to ${params.amount > 0n ? 'increase' : 'decrease'} allowance: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        }));
      } finally {
        setState(prev => ({ ...prev, isPending: false }));
      }
    },
    [handleOperation, operationError]
  );

  /**
   * Increases the allowance for a spender
   * @param params - Parameters for increasing allowance
   * @returns void
   */
  const increaseAllowance = useCallback(
    async (params: AllowanceParams): Promise<void> => {
      const { spender, amount, token } = params;

      if (!provider) throw new Error('No provider');
      if (!token.address) throw new Error('Token address required');

      const mrc20 = new MRC20(provider, token.address);
      await execute(() => mrc20.increaseAllowance(spender, amount), params);
    },
    [provider, execute]
  );

  /**
   * Decreases the allowance for a spender
   * @param params - Parameters for decreasing allowance
   * @returns void
   */
  const decreaseAllowance = useCallback(
    async (params: AllowanceParams): Promise<void> => {
      const { spender, amount, token } = params;

      if (!provider) throw new Error('No provider');
      if (!token.address) throw new Error('Token address required');

      const mrc20 = new MRC20(provider, token.address);
      await execute(() => mrc20.decreaseAllowance(spender, amount), params);
    },
    [provider, execute]
  );

  return useMemo(
    () => ({
      isPending: state.isPending,
      error: state.error,
      operation,
      increaseAllowance,
      decreaseAllowance,
    }),
    [
      state.isPending,
      state.error,
      operation,
      increaseAllowance,
      decreaseAllowance,
    ]
  );
}
