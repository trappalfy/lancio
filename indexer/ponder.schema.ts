import { index, onchainTable, primaryKey } from "ponder";

/**
 * Lancio indexer schema (standalone Ponder indexer, optional). Production runs the built-in indexer in
 * web/indexer/, which mirrors this schema and the handlers in src/ — change both together.
 * Amounts are wei / token units (numeric(78)), timestamps unix seconds,
 * addresses lowercase. Rolling windows (24h / 7d volume, change24h) are computed at query time
 * over `trade` — see src/api/.
 */

export const token = onchainTable(
  "token",
  (t) => ({
    address: t.hex().primaryKey(),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    /** Current creator (changes on CreatorTransferred). */
    creator: t.hex().notNull(),
    createdAt: t.int8({ mode: "number" }).notNull(),
    /** Robinhood Chain block from the TokenCreated event (ArbSys numbering). */
    createdBlock: t.int8({ mode: "number" }).notNull(),
    createdTx: t.hex().notNull(),
    status: t.text().$type<"curve" | "graduated">().notNull(),
    metadataUri: t.text().notNull(),
    description: t.text(),
    image: t.text(),
    x: t.text(),
    telegram: t.text(),
    website: t.text(),
    // Curve state after the last curve trade (frozen at graduation).
    vEth: t.bigint().notNull(),
    vTok: t.bigint().notNull(),
    realEth: t.bigint().notNull(),
    progressBps: t.integer().notNull(),
    // Spot price (wei per whole token) and market cap (wei). After graduation: from pool swaps.
    priceEth: t.bigint().notNull(),
    mcapEth: t.bigint().notNull(),
    volumeEthAll: t.bigint().notNull(),
    tradesCount: t.integer().notNull(),
    /** Holders with balance > 0, excluding zero address, launchpad and PoolManager. */
    holdersCount: t.integer().notNull(),
    lastBuyAt: t.int8({ mode: "number" }),
    lastTradeAt: t.int8({ mode: "number" }),
    graduatedAt: t.int8({ mode: "number" }),
    poolId: t.hex(),
    /** Lifetime creator fees: curve (60% of the 1% fee) + pool ETH side (PoolFeesDeposited). */
    creatorFeesAccruedEth: t.bigint().notNull(),
    creatorFeesClaimedEth: t.bigint().notNull(),
    /** Token-side pool fees paid out by the locker (PoolFeesCollected). Not in the API yet. */
    poolTokenFeesCreator: t.bigint().notNull(),
    poolTokenFeesProtocol: t.bigint().notNull(),
  }),
  (t) => ({
    creatorIdx: index().on(t.creator),
    createdAtIdx: index().on(t.createdAt),
    mcapIdx: index().on(t.mcapEth),
    lastBuyIdx: index().on(t.lastBuyAt),
    statusIdx: index().on(t.status),
  }),
);

export const trade = onchainTable(
  "trade",
  (t) => ({
    /** `${txHash}-${logIndex}` */
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    trader: t.hex().notNull(),
    side: t.text().$type<"buy" | "sell">().notNull(),
    /** Gross ETH incl. fee (pool sells: ETH received). */
    ethAmount: t.bigint().notNull(),
    tokenAmount: t.bigint().notNull(),
    feeEth: t.bigint().notNull(),
    /** Spot price after the trade, wei per whole token. */
    priceEth: t.bigint().notNull(),
    source: t.text().$type<"curve" | "pool">().notNull(),
    txHash: t.hex().notNull(),
    blockNumber: t.int8({ mode: "number" }).notNull(),
    logIndex: t.integer().notNull(),
    timestamp: t.int8({ mode: "number" }).notNull(),
  }),
  (t) => ({
    tokenTimeIdx: index().on(t.token, t.timestamp),
    tokenOrderIdx: index().on(t.token, t.blockNumber, t.logIndex),
    traderOrderIdx: index().on(t.trader, t.blockNumber, t.logIndex),
    timeIdx: index().on(t.timestamp),
  }),
);

export const candle = onchainTable(
  "candle",
  (t) => ({
    token: t.hex().notNull(),
    interval: t.text().$type<"1m" | "5m" | "15m" | "1h" | "4h" | "1d">().notNull(),
    /** Bucket start, unix seconds (UTC-aligned). */
    time: t.int8({ mode: "number" }).notNull(),
    open: t.bigint().notNull(),
    high: t.bigint().notNull(),
    low: t.bigint().notNull(),
    close: t.bigint().notNull(),
    volumeEth: t.bigint().notNull(),
    trades: t.integer().notNull(),
  }),
  (t) => ({
    pk: primaryKey({ columns: [t.token, t.interval, t.time] }),
  }),
);

export const holder = onchainTable(
  "holder",
  (t) => ({
    token: t.hex().notNull(),
    account: t.hex().notNull(),
    balance: t.bigint().notNull(),
  }),
  (t) => ({
    pk: primaryKey({ columns: [t.token, t.account] }),
    tokenBalanceIdx: index().on(t.token, t.balance),
    accountIdx: index().on(t.account),
  }),
);

/** One row per UTC day with any activity. `day` = YYYY-MM-DD. */
export const dailyStats = onchainTable("daily_stats", (t) => ({
  day: t.text().primaryKey(),
  dayStart: t.int8({ mode: "number" }).notNull(),
  volumeEth: t.bigint().notNull(),
  curveVolumeEth: t.bigint().notNull(),
  poolVolumeEth: t.bigint().notNull(),
  trades: t.integer().notNull(),
  launches: t.integer().notNull(),
  graduations: t.integer().notNull(),
  /** Addresses that launched their first token this day. */
  newCreators: t.integer().notNull(),
  curveCreatorsEth: t.bigint().notNull(),
  curveProtocolEth: t.bigint().notNull(),
  poolCreatorsEth: t.bigint().notNull(),
  poolProtocolEth: t.bigint().notNull(),
  /** ETH deposited into locked pools at graduation. */
  lockedLiquidityEth: t.bigint().notNull(),
  protocolClaimedEth: t.bigint().notNull(),
}));

export const account = onchainTable("account", (t) => ({
  address: t.hex().primaryKey(),
  /** Tokens launched by this address (original creator). */
  createdCount: t.integer().notNull(),
  /** Creator fees accrued while this address was the token's creator. */
  creatorFeesAccruedEth: t.bigint().notNull(),
  creatorFeesClaimedEth: t.bigint().notNull(),
  tradesCount: t.integer().notNull(),
}));

/** Graduated Lancio pools: v4 poolId → token. */
export const pool = onchainTable(
  "pool",
  (t) => ({
    poolId: t.hex().primaryKey(),
    token: t.hex().notNull(),
    liquidity: t.bigint().notNull(),
    ethIn: t.bigint().notNull(),
    tokensIn: t.bigint().notNull(),
    createdAt: t.int8({ mode: "number" }).notNull(),
  }),
  (t) => ({
    tokenIdx: index().on(t.token),
  }),
);
