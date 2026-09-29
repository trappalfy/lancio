import { ethUsdSources, type EthUsdResponse } from "@lancio/shared";

const TTL_MS = 60_000;
const STALE_MAX_MS = 15 * 60_000; // past this, report null rather than an old price
const SOURCES = ethUsdSources(process.env.COINGECKO_API_KEY);

let cached: { usd: number; at: number } | null = null;
let lastAttempt = 0;
let inflight: Promise<void> | null = null;

/** First source that answers with a price wins; on total failure the previous value is kept. */
async function refresh() {
  lastAttempt = Date.now();
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, { signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
      const usd = res.ok ? src.parse(await res.json()) : undefined;
      if (usd !== undefined) {
        cached = { usd, at: Date.now() };
        return;
      }
    } catch {
      // try the next source; callers get null once the cached value is too old
    }
  }
}

/** ETH/USD for display only. Cached ~60 s in memory; `usd: null` when unavailable. */
export async function getEthUsd(): Promise<EthUsdResponse> {
  if (!inflight && Date.now() - lastAttempt > TTL_MS) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  if (inflight) await inflight;
  if (cached && Date.now() - cached.at <= STALE_MAX_MS) {
    return { usd: cached.usd, updatedAt: Math.floor(cached.at / 1000) };
  }
  return { usd: null, updatedAt: Math.floor(Date.now() / 1000) };
}
