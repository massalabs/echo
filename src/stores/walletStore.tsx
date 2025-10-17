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
}

export interface TokenState extends TokenMeta {
  balance: bigint | null;
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface PriceCacheEntry {
  priceUsd: number | null;
  fetchedAt: number;
  ttlMs: number;
}

interface WalletStoreState {
  tokens: TokenState[];
  isLoading: boolean;
  isInitialized: boolean;
  lastPriceUpdatedAt?: number;
  lastUpdatedAt?: number;
  priceCache: Record<Ticker, PriceCacheEntry>;
  error: string | null;

  initializeTokens: () => Promise<void>;
  getTokenBalances: (provider: Provider) => Promise<TokenState[]>;
  refreshBalances: (forcePrices?: boolean) => Promise<void>;
  clearCache: (ticker?: Ticker) => void;
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
  },
];

const DEFAULT_TTL_MS = 90_000;
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
  lastPriceUpdatedAt: undefined,
  priceCache: {},
  error: null,

  initializeTokens: async () => {
    // TODO - Initialize tokens from DB
  },

  getTokenBalances: async (provider: Provider): Promise<TokenState[]> => {
    const tokens = useWalletStore.getState().tokens;

    const tokenWithBalances: TokenState[] = await Promise.all(
      tokens.slice(1).map(async token => {
        // const balance = await provider.balance(false);
        const tokenWrapper = new MRC20(provider, token.address);
        let balance = 0n;
        try {
          balance = await tokenWrapper.balanceOf(provider.address);
        } catch (error) {
          console.error('Error getting balance:', error);
        }

        return {
          ...token,
          balance: balance,
        };
      })
    );

    const masBalance = await provider.balance(false);
    tokenWithBalances.unshift({
      ...tokens[0],
      balance: masBalance,
    });

    return tokenWithBalances;
  },

  refreshBalances: async (forcePrices = false) => {
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

      const now = Date.now();
      const nextPriceCache = { ...useWalletStore.getState().priceCache };

      // Batch fetch prices for all tokens
      const tokenNames = useWalletStore
        .getState()
        .tokens.map(token => token.name);

      const prices = await priceFetcher.getUsdPrices(tokenNames);

      const updatedTokens = tokenWithBalances.map(token => {
        const cached = nextPriceCache[token.ticker];
        const fresh = cached && now - cached.fetchedAt < cached.ttlMs;
        const price =
          !forcePrices && fresh
            ? cached.priceUsd
            : prices[token.name.toUpperCase()];

        if (!fresh || forcePrices) {
          nextPriceCache[token.ticker] = {
            priceUsd: price,
            fetchedAt: now,
            ttlMs: DEFAULT_TTL_MS,
          };
        }

        const balanceNum = parseFloat(formatBalance(token.balance)) || 0;
        const valueUsd =
          price != null ? Number((balanceNum * price).toFixed(2)) : 0;

        return {
          ...token,
          priceUsd: price,
          valueUsd: valueUsd,
        };
      });

      set({
        tokens: updatedTokens,
        priceCache: nextPriceCache,
        isLoading: false,
        lastPriceUpdatedAt: now,
        lastUpdatedAt: now,
        error: null,
      });
    } catch (error) {
      console.error('Error refreshing wallet:', error);
      set({ isLoading: false, error: 'Failed to refresh wallet' });
    }
  },

  clearCache: (ticker?: Ticker) => {
    set(state => ({
      priceCache: ticker
        ? Object.fromEntries(
            Object.entries(state.priceCache).filter(([key]) => key !== ticker)
          )
        : {},
    }));
  },
}));

export const useWalletStore = createSelectors(useWalletStoreBase);
