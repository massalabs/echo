interface PriceProvider {
  fetchPrice(base: string, quote: string): Promise<number | null>;
  fetchPrices(
    bases: string[],
    quote: string
  ): Promise<Record<string, number | null>>;
}

abstract class BasePriceProvider implements PriceProvider {

  protected async fetchJson<T>(
    url: string,
    retries = 2,
    delay = 1000
  ): Promise<T | null> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url);
        if (response.status === 429) {
          // Handle rate limiting
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
          continue;
        }
        return response.ok ? response.json() : null;
      } catch {
        if (attempt === retries) return null;
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    return null;
  }

  abstract fetchPrice(base: string, quote: string): Promise<number | null>;
  abstract fetchPrices(
    bases: string[],
    quote: string
  ): Promise<Record<string, number | null>>;
}

class CoinGeckoPriceProvider extends BasePriceProvider {
  private searchUrl = (query: string) =>
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
  private priceUrl = (ids: string[], vs: string) =>
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=${vs}`;

  private async getId(symbol: string): Promise<string | null> {
    const data = await this.fetchJson<{ coins: { id: string }[] }>(
      this.searchUrl(symbol.toLowerCase())
    );
    return data?.coins?.[0]?.id ?? null;
  }

  private async getIds(
    symbols: string[]
  ): Promise<Record<string, string | null>> {
    const idPromises = symbols.map(async symbol => ({
      symbol,
      id: await this.getId(symbol),
    }));
    const results = await Promise.all(idPromises);
    return Object.fromEntries(results.map(({ symbol, id }) => [symbol, id]));
  }

  async fetchPrice(base: string, quote: string): Promise<number | null> {
    const id = await this.getId(base);
    if (!id) return null;
    const data = await this.fetchJson<Record<string, Record<string, number>>>(
      this.priceUrl([id], quote.toLowerCase())
    );
    return data?.[id]?.[quote.toLowerCase()] ?? null;
  }

  async fetchPrices(
    bases: string[],
    quote: string
  ): Promise<Record<string, number | null>> {
    const idsMap = await this.getIds(bases);
    const validIds = Object.values(idsMap).filter(
      (id): id is string => id !== null
    );
    if (!validIds.length)
      return Object.fromEntries(bases.map(base => [base, null]));

    const data = await this.fetchJson<Record<string, Record<string, number>>>(
      this.priceUrl(validIds, quote.toLowerCase())
    );
    return Object.fromEntries(
      bases.map(base => {
        const id = idsMap[base];
        return [
          base,
          id && data?.[id]?.[quote.toLowerCase()] !== undefined
            ? data[id][quote.toLowerCase()]
            : null,
        ];
      })
    );
  }
}

class BinancePriceProvider extends BasePriceProvider {
  private priceUrl = (pair: string) =>
    `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`;

  async fetchPrice(base: string, quote: string): Promise<number | null> {
    const pair = `${base}${quote === 'USD' ? 'USDT' : quote}`;
    const data = await this.fetchJson<{ price: string }>(this.priceUrl(pair));
    const price = Number(data?.price);
    return Number.isFinite(price) ? price : null;
  }

  async fetchPrices(
    bases: string[],
    quote: string
  ): Promise<Record<string, number | null>> {
    const pairPromises = bases.map(async base => {
      const pair = `${base}${quote === 'USD' ? 'USDT' : quote}`;
      const data = await this.fetchJson<{ price: string }>(this.priceUrl(pair));
      const price = Number(data?.price);
      return [base, Number.isFinite(price) ? price : null] as [
        string,
        number | null,
      ];
    });
    return Object.fromEntries(await Promise.all(pairPromises));
  }
}

class PriceFetcher {
  private readonly providers: PriceProvider[] = [
    new CoinGeckoPriceProvider(),
    new BinancePriceProvider(),
  ];

  /**
   * Fetches price for a single token in quote currency.
   * @param baseSymbol Token symbol (e.g., "BTC")
   * @param quoteCurrency Quote currency (e.g., "USD"). Defaults to "USD".
   * @returns Price or null
   */
  async getTokenPrice(
    baseSymbol: string,
    quoteCurrency = 'USD'
  ): Promise<number | null> {
    const base = baseSymbol.toUpperCase();
    const quote = quoteCurrency.toUpperCase();
    for (const provider of this.providers) {
      const price = await provider.fetchPrice(base, quote);
      if (price !== null) return price;
    }
    return null;
  }

  /**
   * Fetches prices for multiple tokens in quote currency.
   * @param baseSymbols Token symbols (e.g., ["BTC", "ETH"])
   * @param quoteCurrency Quote currency (e.g., "USD"). Defaults to "USD".
   * @returns Record of prices (e.g., { BTC: 60000, ETH: 4000 }) or null for unavailable
   */
  async getTokenPrices(
    baseSymbols: string[],
    quoteCurrency = 'USD'
  ): Promise<Record<string, number | null>> {
    const base = baseSymbols.map(s => s.toUpperCase());
    const quote = quoteCurrency.toUpperCase();
    for (const provider of this.providers) {
      const prices = await provider.fetchPrices(base, quote);
      if (Object.values(prices).some(price => price !== null)) {
        return prices;
      }
    }
    return Object.fromEntries(base.map(b => [b, null]));
  }

  /** Gets USD price for a single token. */
  async getUsdPrice(baseSymbol: string): Promise<number | null> {
    return this.getTokenPrice(baseSymbol);
  }

  /** Gets USD prices for multiple tokens. */
  async getUsdPrices(
    baseSymbols: string[]
  ): Promise<Record<string, number | null>> {
    return this.getTokenPrices(baseSymbols);
  }
}

export const priceFetcher = new PriceFetcher();
