import type {
  AccountResponse,
  AccountTradesResponse,
  CandlesResponse,
  DailyResponse,
  EthUsdResponse,
  HoldersResponse,
  HoldingsResponse,
  Interval,
  ProtocolStats,
  SearchResponse,
  TokenResponse,
  TokensQuery,
  TokensResponse,
  TopResponse,
  TradesResponse,
} from "@lancio/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { config } from "./config";

/** Live data refresh (tokens, trades, candles, holders). */
export const LIVE_MS = 4_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Params = Record<string, string | number | undefined | null>;

function qs(params: Params = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

async function mocks() {
  return (await import("./mock")).mockApi;
}

async function get<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  if (config.useMocks) return (await mocks()).get<T>(path, params ?? {});
  if (config.prelaunch) return (await import("./prelaunch")).prelaunchGet<T>(path, params ?? {}, signal);
  const res = await fetch(`${config.indexerUrl}/api${path}${qs(params)}`, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText} — ${path}`);
  return (await res.json()) as T;
}

const lc = (a: string) => a.toLowerCase();

/* ------------------------------------------------------------------ fetchers
 * Usable anywhere (client components, route handlers, generateMetadata) — mocks included.
 */
export const api = {
  tokens: (q: TokensQuery = {}, signal?: AbortSignal) =>
    get<TokensResponse>("/tokens", { status: q.status, sort: q.sort, window: q.window, q: q.q, page: q.page, pageSize: q.pageSize }, signal),
  token: (address: string, signal?: AbortSignal) => get<TokenResponse>(`/tokens/${lc(address)}`, undefined, signal),
  candles: (address: string, interval: Interval, range: { from?: number; to?: number } = {}, signal?: AbortSignal) =>
    get<CandlesResponse>(`/tokens/${lc(address)}/candles`, { interval, from: range.from, to: range.to }, signal),
  trades: (address: string, opts: { limit?: number; before?: string | null } = {}, signal?: AbortSignal) =>
    get<TradesResponse>(`/tokens/${lc(address)}/trades`, { limit: opts.limit ?? 50, before: opts.before }, signal),
  holders: (address: string, limit = 20, signal?: AbortSignal) => get<HoldersResponse>(`/tokens/${lc(address)}/holders`, { limit }, signal),
  stats: (window: "24h" | "all", signal?: AbortSignal) => get<ProtocolStats>("/stats", { window }, signal),
  daily: (days = 14, signal?: AbortSignal) => get<DailyResponse>("/stats/daily", { days }, signal),
  account: (address: string, signal?: AbortSignal) => get<AccountResponse>(`/accounts/${lc(address)}`, undefined, signal),
  holdings: (address: string, signal?: AbortSignal) => get<HoldingsResponse>(`/accounts/${lc(address)}/holdings`, undefined, signal),
  accountTrades: (address: string, opts: { limit?: number; before?: string | null } = {}, signal?: AbortSignal) =>
    get<AccountTradesResponse>(`/accounts/${lc(address)}/trades`, { limit: opts.limit ?? 50, before: opts.before }, signal),
  search: (q: string, signal?: AbortSignal) => get<SearchResponse>("/search", { q }, signal),
  top: (limit = 10, signal?: AbortSignal) => get<TopResponse>("/top", { limit }, signal),
  ethUsd: (signal?: AbortSignal) => get<EthUsdResponse>("/eth-usd", undefined, signal),
};

/* ------------------------------------------------------------------ query keys */
export const qk = {
  all: ["lancio"] as const,
  tokens: (q: TokensQuery) => ["lancio", "tokens", q] as const,
  token: (a: string) => ["lancio", "token", lc(a)] as const,
  candles: (a: string, i: Interval) => ["lancio", "candles", lc(a), i] as const,
  trades: (a: string) => ["lancio", "trades", lc(a)] as const,
  holders: (a: string) => ["lancio", "holders", lc(a)] as const,
  stats: (w: string) => ["lancio", "stats", w] as const,
  daily: (d: number) => ["lancio", "daily", d] as const,
  account: (a: string) => ["lancio", "account", lc(a)] as const,
  holdings: (a: string) => ["lancio", "holdings", lc(a)] as const,
  accountTrades: (a: string) => ["lancio", "accountTrades", lc(a)] as const,
  search: (q: string) => ["lancio", "search", q] as const,
  top: (l: number) => ["lancio", "top", l] as const,
  ethUsd: ["lancio", "ethUsd"] as const,
};

/* ------------------------------------------------------------------ hooks */
const addrOk = (a?: string | null): a is string => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

/** GET /api/tokens — list with status/sort/window/q/page. Keeps the previous page while the next loads. */
export function useTokens(q: TokensQuery = {}) {
  return useQuery({
    queryKey: qk.tokens(q),
    queryFn: ({ signal }) => api.tokens(q, signal),
    refetchInterval: LIVE_MS,
    placeholderData: keepPreviousData,
  });
}

/** GET /api/tokens/:address. 404 → error is ApiError with status 404. */
export function useToken(address?: string | null) {
  return useQuery({
    queryKey: qk.token(address ?? ""),
    queryFn: ({ signal }) => api.token(address!, signal),
    enabled: addrOk(address),
    refetchInterval: LIVE_MS,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1,
  });
}

export function useCandles(address: string | null | undefined, interval: Interval) {
  return useQuery({
    queryKey: qk.candles(address ?? "", interval),
    queryFn: ({ signal }) => api.candles(address!, interval, {}, signal),
    enabled: addrOk(address),
    refetchInterval: LIVE_MS,
    placeholderData: keepPreviousData,
  });
}

/** Latest trades (newest first). For older pages call api.trades(address, { before: nextCursor }). */
export function useTrades(address: string | null | undefined, limit = 50) {
  return useQuery({
    queryKey: [...qk.trades(address ?? ""), limit],
    queryFn: ({ signal }) => api.trades(address!, { limit }, signal),
    enabled: addrOk(address),
    refetchInterval: LIVE_MS,
  });
}

export function useHolders(address: string | null | undefined, limit = 20) {
  return useQuery({
    queryKey: [...qk.holders(address ?? ""), limit],
    queryFn: ({ signal }) => api.holders(address!, limit, signal),
    enabled: addrOk(address),
    refetchInterval: LIVE_MS,
  });
}

export function useStats(window: "24h" | "all") {
  return useQuery({ queryKey: qk.stats(window), queryFn: ({ signal }) => api.stats(window, signal), refetchInterval: 30_000 });
}

export function useDaily(days = 14) {
  return useQuery({ queryKey: qk.daily(days), queryFn: ({ signal }) => api.daily(days, signal), refetchInterval: 60_000 });
}

export function useAccount(address?: string | null) {
  return useQuery({
    queryKey: qk.account(address ?? ""),
    queryFn: ({ signal }) => api.account(address!, signal),
    enabled: addrOk(address),
    refetchInterval: LIVE_MS,
  });
}

export function useHoldings(address?: string | null) {
  return useQuery({
    queryKey: qk.holdings(address ?? ""),
    queryFn: ({ signal }) => api.holdings(address!, signal),
    enabled: addrOk(address),
    refetchInterval: LIVE_MS,
  });
}

export function useAccountTrades(address?: string | null, limit = 50) {
  return useQuery({
    queryKey: [...qk.accountTrades(address ?? ""), limit],
    queryFn: ({ signal }) => api.accountTrades(address!, { limit }, signal),
    enabled: addrOk(address),
    refetchInterval: LIVE_MS,
  });
}

/** Name/symbol prefix or address; disabled for empty input. Debounce the input in the caller. */
export function useSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: qk.search(term),
    queryFn: ({ signal }) => api.search(term, signal),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useTop(limit = 10) {
  return useQuery({ queryKey: qk.top(limit), queryFn: ({ signal }) => api.top(limit, signal), refetchInterval: 15_000 });
}

/** ETH/USD (indexer caches ~60s). data?.usd may be null — fall back to ETH display. */
export function useEthUsd() {
  return useQuery({
    queryKey: qk.ethUsd,
    queryFn: ({ signal }) => api.ethUsd(signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 0,
  });
}
