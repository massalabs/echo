import { OperationStatus } from '@massalabs/massa-web3';

export interface Asset {
  decimals: number;
  balance: bigint;
  symbol: string;
  address?: string;
  isNative?: boolean;
}

export interface OperationError {
  message: string;
  status?: OperationStatus;
}
