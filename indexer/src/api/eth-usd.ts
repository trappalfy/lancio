import type { EthUsdResponse } from "@lancio/shared";

const TTL_MS = 60_000;
const STALE_MAX_MS = 15 * 60_000; // past this, report null rather than an old price
const URL =
  process.env.COINGECKO_API_KEY
    ? `https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&x_cg_demo_api_key=${encodeURIComponent(process.env.COINGECKO_API_KEY)}`
    : "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";

let cached: { usd: number; at: number } | null = null;
let lastAttempt = 0;
let inflight: Promise<void> | null = null;

async function refresh() {
  lastAttempt = Date.now();
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
    if (!res.ok) return;
    const json = (await res.json()) as { ethereum?: { usd?: unknown } };
    const usd = json.ethereum?.usd;
    if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) cached = { usd, at: Date.now() };
  } catch {
    // keep the previous value; callers get null once it is too old
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
