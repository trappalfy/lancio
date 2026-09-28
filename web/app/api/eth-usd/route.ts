import type { EthUsdResponse } from "@lancio/shared";

/**
 * ETH/USD for display, used before launch (lib/prelaunch.ts) when there is no indexer to ask. CoinGecko, cached
 * 60 s by Next's data cache and the CDN, so visitors never hit CoinGecko directly. `usd: null` when unavailable.
 */
const SOURCE = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";

export async function GET() {
  let body: EthUsdResponse = { usd: null, updatedAt: Math.floor(Date.now() / 1000) };
  try {
    const res = await fetch(SOURCE, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
    const usd = res.ok ? ((await res.json()) as { ethereum?: { usd?: unknown } }).ethereum?.usd : undefined;
    if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) body = { usd, updatedAt: body.updatedAt };
  } catch {
    /* keep null */
  }
  return Response.json(body, { headers: { "cache-control": body.usd ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store" } });
}
