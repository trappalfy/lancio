/**
 * Data before the contracts are deployed (config.prelaunch): no token can exist yet, so every list is empty and every
 * figure is zero — the UI shows its normal empty states instead of "could not be loaded". The ETH price still comes
 * from the site's own /api/eth-usd. Once NEXT_PUBLIC_LAUNCHPAD (and the indexer) are set, lib/api.ts reads the indexer.
 */
import type { AccountResponse, DailyResponse, EthUsdResponse, ProtocolStats, TokensResponse, TradesResponse } from "@lancio/shared";
import { ApiError } from "./api";

type Params = Record<string, string | number | undefined | null>;

const ADDR = "0x[0-9a-f]{40}";
const now = () => Math.floor(Date.now() / 1000);
const noTrades: TradesResponse = { items: [], nextCursor: null };

function stats(window: "24h" | "all"): ProtocolStats {
  return {
    window,
    updatedAt: now(),
    latestCompleteDay: null,
    volumeEth: "0",
    volumeChangePct: null,
    launches: 0,
    launchesChangePct: null,
    graduations: 0,
    uniqueCreators: 0,
    fees: {
      creatorsEth: "0",
      protocolEth: "0",
      curveCreatorsEth: "0",
      curveProtocolEth: "0",
      poolCreatorsEth: "0",
      poolProtocolEth: "0",
      lockedLiquidityEth: "0",
    },
  };
}

async function ethUsd(signal?: AbortSignal): Promise<EthUsdResponse> {
  if (typeof window === "undefined") return { usd: null, updatedAt: now() };
  try {
    const res = await fetch("/api/eth-usd", { signal, headers: { accept: "application/json" } });
    if (res.ok) return (await res.json()) as EthUsdResponse;
  } catch {
    /* price is display-only */
  }
  return { usd: null, updatedAt: now() };
}

export async function prelaunchGet<T>(path: string, params: Params, signal?: AbortSignal): Promise<T> {
  const r = (v: unknown) => v as T;
  if (path === "/tokens") {
    const empty: TokensResponse = { items: [], total: 0, page: Number(params.page ?? 1), pageSize: Number(params.pageSize ?? 25) };
    return r(empty);
  }
  if (new RegExp(`^/tokens/${ADDR}$`).test(path)) throw new ApiError(404, "Token not found");
  if (new RegExp(`^/tokens/${ADDR}/(candles|holders)$`).test(path)) return r([]);
  if (new RegExp(`^/tokens/${ADDR}/trades$`).test(path)) return r(noTrades);
  if (path === "/stats") return r(stats(params.window === "24h" ? "24h" : "all"));
  if (path === "/stats/daily") return r([] satisfies DailyResponse);
  const account = new RegExp(`^/accounts/(${ADDR})$`).exec(path);
  if (account) {
    const empty: AccountResponse = { address: account[1] as `0x${string}`, created: [], creatorFeesAccruedEth: "0", creatorFeesClaimedEth: "0", tradesCount: 0 };
    return r(empty);
  }
  if (new RegExp(`^/accounts/${ADDR}/holdings$`).test(path)) return r([]);
  if (new RegExp(`^/accounts/${ADDR}/trades$`).test(path)) return r(noTrades);
  if (path === "/search" || path === "/top") return r([]);
  if (path === "/eth-usd") return r(await ethUsd(signal));
  throw new ApiError(404, `No data before launch — ${path}`);
}
