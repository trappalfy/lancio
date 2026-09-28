import { bigint, boolean, customType, integer, pgSchema, primaryKey, text } from "drizzle-orm/pg-core";

/**
 * Built-in indexer tables, in their own Postgres schema next to the forum tables (same database).
 * Mirrors indexer/ponder.schema.ts: amounts are wei / token units (numeric(78)), timestamps unix seconds,
 * addresses lowercase. Rolling windows (24h / 7d volume, change24h) are computed at query time over `trade`.
 *
 * Bump SCHEMA_VERSION whenever a table or an event handler changes: the schema is then dropped and rebuilt
 * from START_BLOCK on the next sync (cheap — only Lancio's own logs are fetched).
 */
export const SCHEMA_VERSION = 1;
export const SCHEMA = "lancio_ix";

const ix = pgSchema(SCHEMA);

/** uint256 as numeric(78,0) ↔ bigint. Drivers return numeric as a decimal string. */
const wei = customType<{ data: bigint; driverData: string }>({
  dataType: () => "numeric(78,0)",
  fromDriver: (v) => BigInt(v),
  toDriver: (v) => v.toString(),
});

const int8 = (name: string) => bigint(name, { mode: "number" });

export const syncState = ix.table("sync_state", {
  id: text("id").primaryKey(),
  launchpad: text("launchpad").notNull(),
  version: integer("version").notNull(),
  startBlock: int8("start_block").notNull(),
  /** Last block whose logs are fully applied. */
  cursor: int8("cursor").notNull(),
  /** Chain head (minus the safety lag) seen by the last sync. */
  head: int8("head").notNull(),
  /** ms epoch; a sync holds the lease until then (0 = free). */
  leaseUntil: int8("lease_until").notNull(),
  /** ms epoch of the last sync attempt (throttle). */
  lastSyncAt: int8("last_sync_at").notNull(),
  /** ms epoch of the last cursor advance. */
  syncedAt: int8("synced_at").notNull(),
  lastError: text("last_error"),
});

export const token = ix.table("token", {
  address: text("address").$type<`0x${string}`>().primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  /** Current creator (changes on CreatorTransferred). */
  creator: text("creator").$type<`0x${string}`>().notNull(),
  createdAt: int8("created_at").notNull(),
  /** Robinhood Chain block from the TokenCreated event (ArbSys numbering). */
  createdBlock: int8("created_block").notNull(),
  createdTx: text("created_tx").$type<`0x${string}`>().notNull(),
  status: text("status").$type<"curve" | "graduated">().notNull(),
  metadataUri: text("metadata_uri").notNull(),
  description: text("description"),
  image: text("image"),
  x: text("x"),
  telegram: text("telegram"),
  website: text("website"),
  /** Metadata is fetched after the token row is written; failed fetches are retried a few times. */
  metaPending: boolean("meta_pending").notNull(),
  metaAttempts: integer("meta_attempts").notNull(),
  // Curve state after the last curve trade (frozen at graduation).
  vEth: wei("v_eth").notNull(),
  vTok: wei("v_tok").notNull(),
  realEth: wei("real_eth").notNull(),
  progressBps: integer("progress_bps").notNull(),
  // Spot price (wei per whole token) and market cap (wei). After graduation: from pool swaps.
  priceEth: wei("price_eth").notNull(),
  mcapEth: wei("mcap_eth").notNull(),
  volumeEthAll: wei("volume_eth_all").notNull(),
  tradesCount: integer("trades_count").notNull(),
  /** Holders with balance > 0, excluding zero address, launchpad and PoolManager. */
  holdersCount: integer("holders_count").notNull(),
  lastBuyAt: int8("last_buy_at"),
  lastTradeAt: int8("last_trade_at"),
  graduatedAt: int8("graduated_at"),
  poolId: text("pool_id").$type<`0x${string}`>(),
  /** Lifetime creator fees: curve (60% of the 1% fee) + pool ETH side (PoolFeesDeposited). */
  creatorFeesAccruedEth: wei("creator_fees_accrued_eth").notNull(),
  creatorFeesClaimedEth: wei("creator_fees_claimed_eth").notNull(),
  /** Token-side pool fees paid out by the locker (PoolFeesCollected). Not in the API yet. */
  poolTokenFeesCreator: wei("pool_token_fees_creator").notNull(),
  poolTokenFeesProtocol: wei("pool_token_fees_protocol").notNull(),
});

export const trade = ix.table("trade", {
  /** `${txHash}-${logIndex}` */
  id: text("id").primaryKey(),
  token: text("token").$type<`0x${string}`>().notNull(),
  trader: text("trader").$type<`0x${string}`>().notNull(),
  side: text("side").$type<"buy" | "sell">().notNull(),
  /** Gross ETH incl. fee (pool sells: ETH received). */
  ethAmount: wei("eth_amount").notNull(),
  tokenAmount: wei("token_amount").notNull(),
  feeEth: wei("fee_eth").notNull(),
  /** Spot price after the trade, wei per whole token. */
  priceEth: wei("price_eth").notNull(),
  source: text("source").$type<"curve" | "pool">().notNull(),
  txHash: text("tx_hash").$type<`0x${string}`>().notNull(),
  blockNumber: int8("block_number").notNull(),
  logIndex: integer("log_index").notNull(),
  timestamp: int8("timestamp").notNull(),
});

export const candle = ix.table(
  "candle",
  {
    token: text("token").$type<`0x${string}`>().notNull(),
    interval: text("interval").$type<"1m" | "5m" | "15m" | "1h" | "4h" | "1d">().notNull(),
    /** Bucket start, unix seconds (UTC-aligned). */
    time: int8("time").notNull(),
    open: wei("open").notNull(),
    high: wei("high").notNull(),
    low: wei("low").notNull(),
    close: wei("close").notNull(),
    volumeEth: wei("volume_eth").notNull(),
    trades: integer("trades").notNull(),
  },
  (t) => [primaryKey({ columns: [t.token, t.interval, t.time] })],
);

export const holder = ix.table(
  "holder",
  {
    token: text("token").$type<`0x${string}`>().notNull(),
    account: text("account").$type<`0x${string}`>().notNull(),
    balance: wei("balance").notNull(),
  },
  (t) => [primaryKey({ columns: [t.token, t.account] })],
);

/** One row per UTC day with any activity. `day` = YYYY-MM-DD. */
export const dailyStats = ix.table("daily_stats", {
  day: text("day").primaryKey(),
  dayStart: int8("day_start").notNull(),
  volumeEth: wei("volume_eth").notNull(),
  curveVolumeEth: wei("curve_volume_eth").notNull(),
  poolVolumeEth: wei("pool_volume_eth").notNull(),
  trades: integer("trades").notNull(),
  launches: integer("launches").notNull(),
  graduations: integer("graduations").notNull(),
  /** Addresses that launched their first token this day. */
  newCreators: integer("new_creators").notNull(),
  curveCreatorsEth: wei("curve_creators_eth").notNull(),
  curveProtocolEth: wei("curve_protocol_eth").notNull(),
  poolCreatorsEth: wei("pool_creators_eth").notNull(),
  poolProtocolEth: wei("pool_protocol_eth").notNull(),
  /** ETH deposited into locked pools at graduation. */
  lockedLiquidityEth: wei("locked_liquidity_eth").notNull(),
  protocolClaimedEth: wei("protocol_claimed_eth").notNull(),
});

export const account = ix.table("account", {
  address: text("address").$type<`0x${string}`>().primaryKey(),
  /** Tokens launched by this address (original creator). */
  createdCount: integer("created_count").notNull(),
  /** Creator fees accrued while this address was the token's creator. */
  creatorFeesAccruedEth: wei("creator_fees_accrued_eth").notNull(),
  creatorFeesClaimedEth: wei("creator_fees_claimed_eth").notNull(),
  tradesCount: integer("trades_count").notNull(),
});

/** Graduated Lancio pools: v4 poolId → token. */
export const pool = ix.table("pool", {
  poolId: text("pool_id").$type<`0x${string}`>().primaryKey(),
  token: text("token").$type<`0x${string}`>().notNull(),
  liquidity: wei("liquidity").notNull(),
  ethIn: wei("eth_in").notNull(),
  tokensIn: wei("tokens_in").notNull(),
  createdAt: int8("created_at").notNull(),
});

export type TokenRow = typeof token.$inferSelect;
export type TradeRow = typeof trade.$inferSelect;
export type CandleRow = typeof candle.$inferSelect;
export type HolderRow = typeof holder.$inferSelect;
export type DailyRow = typeof dailyStats.$inferSelect;
export type AccountRow = typeof account.$inferSelect;
export type PoolRow = typeof pool.$inferSelect;

const S = SCHEMA;
const W = "numeric(78,0) NOT NULL";

/** Idempotent DDL, one statement per entry. Must match the tables above. */
export const DDL = [
  `CREATE SCHEMA IF NOT EXISTS ${S}`,
  `CREATE TABLE IF NOT EXISTS ${S}.sync_state (
    id text PRIMARY KEY,
    launchpad text NOT NULL,
    version integer NOT NULL,
    start_block bigint NOT NULL,
    cursor bigint NOT NULL,
    head bigint NOT NULL DEFAULT 0,
    lease_until bigint NOT NULL DEFAULT 0,
    last_sync_at bigint NOT NULL DEFAULT 0,
    synced_at bigint NOT NULL DEFAULT 0,
    last_error text
  )`,
  `CREATE TABLE IF NOT EXISTS ${S}.token (
    address text PRIMARY KEY,
    name text NOT NULL,
    symbol text NOT NULL,
    creator text NOT NULL,
    created_at bigint NOT NULL,
    created_block bigint NOT NULL,
    created_tx text NOT NULL,
    status text NOT NULL,
    metadata_uri text NOT NULL,
    description text,
    image text,
    x text,
    telegram text,
    website text,
    meta_pending boolean NOT NULL,
    meta_attempts integer NOT NULL,
    v_eth ${W},
    v_tok ${W},
    real_eth ${W},
    progress_bps integer NOT NULL,
    price_eth ${W},
    mcap_eth ${W},
    volume_eth_all ${W},
    trades_count integer NOT NULL,
    holders_count integer NOT NULL,
    last_buy_at bigint,
    last_trade_at bigint,
    graduated_at bigint,
    pool_id text,
    creator_fees_accrued_eth ${W},
    creator_fees_claimed_eth ${W},
    pool_token_fees_creator ${W},
    pool_token_fees_protocol ${W}
  )`,
  `CREATE INDEX IF NOT EXISTS token_creator_idx ON ${S}.token (creator)`,
  `CREATE INDEX IF NOT EXISTS token_created_at_idx ON ${S}.token (created_at)`,
  `CREATE INDEX IF NOT EXISTS token_mcap_idx ON ${S}.token (mcap_eth)`,
  `CREATE INDEX IF NOT EXISTS token_last_buy_idx ON ${S}.token (last_buy_at)`,
  `CREATE INDEX IF NOT EXISTS token_status_idx ON ${S}.token (status)`,
  `CREATE INDEX IF NOT EXISTS token_meta_pending_idx ON ${S}.token (meta_pending) WHERE meta_pending`,
  `CREATE TABLE IF NOT EXISTS ${S}.trade (
    id text PRIMARY KEY,
    token text NOT NULL,
    trader text NOT NULL,
    side text NOT NULL,
    eth_amount ${W},
    token_amount ${W},
    fee_eth ${W},
    price_eth ${W},
    source text NOT NULL,
    tx_hash text NOT NULL,
    block_number bigint NOT NULL,
    log_index integer NOT NULL,
    timestamp bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS trade_token_time_idx ON ${S}.trade (token, timestamp)`,
  `CREATE INDEX IF NOT EXISTS trade_token_order_idx ON ${S}.trade (token, block_number, log_index)`,
  `CREATE INDEX IF NOT EXISTS trade_trader_order_idx ON ${S}.trade (trader, block_number, log_index)`,
  `CREATE INDEX IF NOT EXISTS trade_time_idx ON ${S}.trade (timestamp)`,
  `CREATE TABLE IF NOT EXISTS ${S}.candle (
    token text NOT NULL,
    interval text NOT NULL,
    time bigint NOT NULL,
    open ${W},
    high ${W},
    low ${W},
    close ${W},
    volume_eth ${W},
    trades integer NOT NULL,
    PRIMARY KEY (token, interval, time)
  )`,
  `CREATE TABLE IF NOT EXISTS ${S}.holder (
    token text NOT NULL,
    account text NOT NULL,
    balance ${W},
    PRIMARY KEY (token, account)
  )`,
  `CREATE INDEX IF NOT EXISTS holder_token_balance_idx ON ${S}.holder (token, balance)`,
  `CREATE INDEX IF NOT EXISTS holder_account_idx ON ${S}.holder (account)`,
  `CREATE TABLE IF NOT EXISTS ${S}.daily_stats (
    day text PRIMARY KEY,
    day_start bigint NOT NULL,
    volume_eth ${W},
    curve_volume_eth ${W},
    pool_volume_eth ${W},
    trades integer NOT NULL,
    launches integer NOT NULL,
    graduations integer NOT NULL,
    new_creators integer NOT NULL,
    curve_creators_eth ${W},
    curve_protocol_eth ${W},
    pool_creators_eth ${W},
    pool_protocol_eth ${W},
    locked_liquidity_eth ${W},
    protocol_claimed_eth ${W}
  )`,
  `CREATE TABLE IF NOT EXISTS ${S}.account (
    address text PRIMARY KEY,
    created_count integer NOT NULL,
    creator_fees_accrued_eth ${W},
    creator_fees_claimed_eth ${W},
    trades_count integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${S}.pool (
    pool_id text PRIMARY KEY,
    token text NOT NULL,
    liquidity ${W},
    eth_in ${W},
    tokens_in ${W},
    created_at bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS pool_token_idx ON ${S}.pool (token)`,
];
