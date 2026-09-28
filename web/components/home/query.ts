import type { SortKey, TokenStatus, WindowKey } from "@lancio/shared";

/** Explore list state, kept in the URL query: /?sort=&window=&status=&page= (defaults are omitted). */
export type ExploreState = { sort: SortKey; window: WindowKey; status: TokenStatus; page: number };

export const PAGE_SIZE = 25;
export const EXPLORE_ANCHOR = "explore";
/** The Explore list card itself (below Graduated) — "Show all" lands here. */
export const EXPLORE_PANEL_ANCHOR = "explore-panel";

export const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: "recentBuys", label: "Recent buys" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "marketCap", label: "Market cap" },
  { value: "volume", label: "Volume" },
];

export const WINDOWS: readonly { value: WindowKey; label: string }[] = [
  { value: "all", label: "All" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
];

export const DEFAULT_EXPLORE: ExploreState = { sort: "recentBuys", window: "all", status: "curve", page: 1 };

type Params = { get(name: string): string | null };

function pick<T extends string>(value: string | null, allowed: readonly { value: T }[], fallback: T): T {
  return allowed.some((a) => a.value === value) ? (value as T) : fallback;
}

export function parseExplore(sp: Params | null): ExploreState {
  if (!sp) return DEFAULT_EXPLORE;
  const page = Number.parseInt(sp.get("page") ?? "", 10);
  return {
    sort: pick(sp.get("sort"), SORTS, DEFAULT_EXPLORE.sort),
    window: pick(sp.get("window"), WINDOWS, DEFAULT_EXPLORE.window),
    status: sp.get("status") === "graduated" ? "graduated" : "curve",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** "/?sort=newest&page=2" — default values are left out; "/" when everything is default. */
export function exploreHref(state: ExploreState, hash?: string): string {
  const u = new URLSearchParams();
  if (state.sort !== DEFAULT_EXPLORE.sort) u.set("sort", state.sort);
  if (state.window !== DEFAULT_EXPLORE.window) u.set("window", state.window);
  if (state.status !== DEFAULT_EXPLORE.status) u.set("status", state.status);
  if (state.page > 1) u.set("page", String(state.page));
  const qs = u.toString();
  return `/${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}
