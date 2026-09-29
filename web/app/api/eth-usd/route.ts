import { ethUsdSources, type EthUsdResponse } from "@lancio/shared";

/**
 * ETH/USD for display (built-in indexer and prelaunch mode). Keyless exchange APIs tried in order
 * (packages/shared/src/prices.ts), each cached 60 s by Next's data cache; the response is cached by the CDN, so
 * visitors never hit the sources directly. `usd: null` when every source fails.
 */
const SOURCES = ethUsdSources(process.env.COINGECKO_API_KEY);

async function fetchUsd(): Promise<number | null> {
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
      const usd = res.ok ? src.parse(await res.json()) : undefined;
      if (usd !== undefined) return usd;
    } catch {
      /* next source */
    }
  }
  return null;
}

export async function GET() {
  const usd = await fetchUsd();
  const body: EthUsdResponse = { usd, updatedAt: Math.floor(Date.now() / 1000) };
  return Response.json(body, { headers: { "cache-control": usd ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store" } });
}
