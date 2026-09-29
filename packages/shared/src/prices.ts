/**
 * Keyless ETH/USD sources for display prices, tried in order. CoinGecko's keyless API started answering 403
 * (2026-09-29), so it comes last and only helps with a demo key (COINGECKO_API_KEY).
 * Used by web/app/api/eth-usd/route.ts and indexer/src/api/eth-usd.ts.
 */
export type EthUsdSource = { name: string; url: string; parse: (json: unknown) => number | undefined };

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
};

export function ethUsdSources(coingeckoKey?: string): EthUsdSource[] {
  return [
    {
      name: "coinbase",
      url: "https://api.coinbase.com/v2/prices/ETH-USD/spot",
      parse: (j) => num((j as { data?: { amount?: unknown } })?.data?.amount),
    },
    {
      name: "kraken",
      url: "https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
      parse: (j) => num((j as { result?: Record<string, { c?: unknown[] }> })?.result?.XETHZUSD?.c?.[0]),
    },
    {
      name: "coingecko",
      url: `https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd${
        coingeckoKey ? `&x_cg_demo_api_key=${encodeURIComponent(coingeckoKey)}` : ""
      }`,
      parse: (j) => num((j as { ethereum?: { usd?: unknown } })?.ethereum?.usd),
    },
  ];
}
