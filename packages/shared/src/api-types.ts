/**
 * REST contract between indexer/ (Ponder, Hono routes) and web/.
 * All wei / token-unit amounts are decimal strings. Timestamps are unix seconds. Addresses lowercase.
 * Base URL: NEXT_PUBLIC_INDEXER_URL (e.g. http://localhost:42069). Routes live under /api.
 */
export type Hex = `0x${string}`;
export type TokenStatus = "curve" | "graduated";
export type SortKey = "recentBuys" | "newest" | "oldest" | "marketCap" | "volume";
export type WindowKey = "all" | "24h" | "7d";
export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type TokenMeta = {
  description: string | null;
  image: string | null; // resolved https URL (gateway), never raw ipfs://
  x: string | null;
  telegram: string | null;
  website: string | null;
};

export type TokenSummary = {
  address: Hex;
  name: string;
  symbol: string;
  creator: Hex; // current creator
  createdAt: number;
  createdBlock: number; // Robinhood Chain block (ArbSys)
  status: TokenStatus;
  metadataUri: string;
  meta: TokenMeta;
  vEth: string;
  vTok: string;
  realEth: string;
  progressBps: number; // 0..10000
  priceEth: string; // wei per 1 whole token
  mcapEth: string; // wei
  volumeEth24h: string; // rolling 24h, gross
  volumeEth7d: string;
  volumeEthAll: string;
  change24hPct: number | null; // price change vs 24h ago (rolling); null if no data
  tradesCount: number;
  holdersCount: number;
  lastBuyAt: number | null;
  lastTradeAt: number | null;
  graduatedAt: number | null;
  poolId: Hex | null;
};

export type TokenDetail = TokenSummary & {
  creatorFeesAccruedEth: string; // lifetime creator fees (curve + pool ETH side)
  creatorFeesClaimedEth: string;
};

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

/** GET /api/tokens?status=curve|graduated|all&sort=SortKey&window=WindowKey&q=&page=1&pageSize=25 */
export type TokensQuery = {
  status?: TokenStatus | "all";
  sort?: SortKey;
  window?: WindowKey;
  q?: string;
  page?: number;
  pageSize?: number;
};
export type TokensResponse = Page<TokenSummary>;

/** GET /api/tokens/:address */
export type TokenResponse = TokenDetail;

/** GET /api/tokens/:address/candles?interval=1m&from=&to=  (ascending by time) */
export type Candle = {
  time: number; // bucket start
  open: string; // price, wei per whole token
  high: string;
  low: string;
  close: string;
  volumeEth: string;
};
export type CandlesResponse = Candle[];

/** GET /api/tokens/:address/trades?limit=50&before=<cursor>  (newest first) */
export type Trade = {
  id: string; // `${txHash}-${logIndex}`
  txHash: Hex;
  blockNumber: number;
  timestamp: number;
  token: Hex;
  symbol?: string;
  trader: Hex;
  side: "buy" | "sell";
  ethAmount: string; // gross ETH (incl. fee)
  tokenAmount: string;
  feeEth: string;
  priceEth: string; // spot after trade, wei per whole token
  source: "curve" | "pool";
};
export type TradesResponse = { items: Trade[]; nextCursor: string | null };

/** GET /api/tokens/:address/holders?limit=20 */
export type Holder = {
  account: Hex;
  balance: string;
  shareBps: number; // of TOTAL_SUPPLY
  label: "curve" | "pool" | "creator" | null;
};
export type HoldersResponse = Holder[];

/** GET /api/stats?window=24h|all  — 24h = last completed UTC day */
export type ProtocolStats = {
  window: "24h" | "all";
  updatedAt: number;
  latestCompleteDay: string | null; // YYYY-MM-DD (UTC)
  volumeEth: string;
  volumeChangePct: number | null; // vs prior day (24h only)
  launches: number;
  launchesChangePct: number | null;
  graduations: number;
  uniqueCreators: number; // lifetime
  fees: {
    creatorsEth: string; // accrued to creators (curve + pool ETH)
    protocolEth: string; // accrued to treasury
    curveCreatorsEth: string;
    curveProtocolEth: string;
    poolCreatorsEth: string;
    poolProtocolEth: string;
    lockedLiquidityEth: string; // ETH deposited into locked pools at graduation (sum)
  };
};

/** GET /api/stats/daily?days=14  (ascending, completed UTC days only) */
export type DailyPoint = {
  day: string; // YYYY-MM-DD
  volumeEth: string;
  launches: number;
  graduations: number;
};
export type DailyResponse = DailyPoint[];

/** GET /api/accounts/:address */
export type AccountResponse = {
  address: Hex;
  created: TokenSummary[];
  creatorFeesAccruedEth: string;
  creatorFeesClaimedEth: string;
  tradesCount: number;
};

/** GET /api/accounts/:address/holdings */
export type Holding = { token: TokenSummary; balance: string };
export type HoldingsResponse = Holding[];

/** GET /api/accounts/:address/trades?limit=50&before= */
export type AccountTradesResponse = TradesResponse;

/** GET /api/search?q=  (name/symbol prefix or address; max 10) */
export type SearchResponse = TokenSummary[];

/** GET /api/top?limit=10  (by mcap) */
export type TopResponse = TokenSummary[];

/** GET /api/eth-usd  (cached ~60s by the indexer) */
export type EthUsdResponse = { usd: number | null; updatedAt: number };
