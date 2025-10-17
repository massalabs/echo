import { create } from 'zustand';
import masIcon from '../assets/MAS.svg';
import { Mas, MRC20, Provider } from '@massalabs/massa-web3';
import { useAccountStore } from './accountStore';
import { priceFetcher } from '../utils/fetchPrice';
import { createSelectors } from './createSelectors';

export type Ticker = string;

export interface TokenMeta {
  address: string;
  name: string;
  ticker: Ticker;
  icon: string;
  decimals?: number;
  isNative: boolean;
}

export interface TokenState extends TokenMeta {
  balance: bigint | null;
  priceUsd: number | null;
  valueUsd: number | null;
}

interface WalletStoreState {
  tokens: TokenState[];
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  initializeTokens: () => Promise<void>;
  getTokenBalances: (provider: Provider) => Promise<TokenState[]>;
  refreshBalances: () => Promise<void>;
}

const initialTokens = [
  {
    address: 'MASSA',
    name: 'Massa',
    ticker: 'MAS',
    icon: masIcon,
    balance: null,
    priceUsd: null,
    valueUsd: null,
    isNative: true,
  },

  // TODO- Remove, testing purposes
  {
    address: 'AS125oPLYRTtfVjpWisPZVTLjBhCFfQ1jDsi75XNtRm1NZux54eCj',
    name: 'Wrapped Ether',
    ticker: 'ETH',
    icon: masIcon, // Assumes you have an ETH icon
    balance: null,
    priceUsd: null,
    valueUsd: null,
    isNative: false,
  },
];

const DISPLAY_DECIMALS = 3;

// TODO - take from ui-kit
export function formatBalance(
  raw: bigint | null,
  decimals: number = DISPLAY_DECIMALS
): string {
  return Mas.toString(raw ?? 0n, decimals);
}

const useWalletStoreBase = create<WalletStoreState>(set => ({
  tokens: initialTokens,
  isLoading: false,
  isInitialized: false,
  error: null,

  initializeTokens: async () => {
    // TODO - Initialize tokens from DB
  },

  getTokenBalances: async (provider: Provider): Promise<TokenState[]> => {
    const tokens = useWalletStore.getState().tokens;

    return Promise.all(
      tokens.map(async token => {
        let balance = 0n;
        try {
          if (token.isNative) {
            balance = await provider.balance(false);
          } else {
            const tokenWrapper = new MRC20(provider, token.address);
            balance = await tokenWrapper.balanceOf(provider.address);
          }
        } catch (error) {
          console.error(`Error getting balance for ${token.name}:`, error);
        }
        return { ...token, balance };
      })
    );
  },

  refreshBalances: async () => {
    const provider = useAccountStore.getState().provider;
    if (!provider) {
      set({ error: 'No provider available' });
      return;
    }
    set({ isLoading: true, error: null });

    try {
      const tokenWithBalances: TokenState[] = await useWalletStore
        .getState()
        .getTokenBalances(provider);

      const tokenTickers = useWalletStore
        .getState()
        .tokens.map(token => token.ticker);

      const prices = await priceFetcher.getUsdPrices(tokenTickers);

      const updatedTokens = tokenWithBalances.map(token => {
        const priceUsd = prices[token.ticker.toUpperCase()];

        const balanceNum = parseFloat(formatBalance(token.balance)) || 0;
        const valueUsd = priceUsd != null ? balanceNum * priceUsd : null;

        return {
          ...token,
          priceUsd,
          valueUsd,
        };
      });

      set({
        tokens: updatedTokens,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error refreshing wallet:', error);
      set({ isLoading: false, error: 'Failed to refresh wallet' });
    }
  },
}));

export const useWalletStore = createSelectors(useWalletStoreBase);
