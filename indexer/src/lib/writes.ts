/** Upsert helpers used by the indexing handlers. */
import type { Context } from "ponder:registry";
import { account, candle, dailyStats, pool } from "ponder:schema";
import { dayKey, dayStartOf, INTERVALS, type Hex } from "./shared";

type Db = Context["db"];

type DailyCounters = Omit<typeof dailyStats.$inferSelect, "day" | "dayStart">;
const EMPTY_DAILY: DailyCounters = {
  volumeEth: 0n,
  curveVolumeEth: 0n,
  poolVolumeEth: 0n,
  trades: 0,
  launches: 0,
  graduations: 0,
  newCreators: 0,
  curveCreatorsEth: 0n,
  curveProtocolEth: 0n,
  poolCreatorsEth: 0n,
  poolProtocolEth: 0n,
  lockedLiquidityEth: 0n,
  protocolClaimedEth: 0n,
};

/** Adds `delta` to the counters of the UTC day containing `ts`. */
export async function bumpDaily(db: Db, ts: number, delta: Partial<DailyCounters>) {
  const dayStart = dayStartOf(ts);
  await db
    .insert(dailyStats)
    .values({ day: dayKey(dayStart), dayStart, ...EMPTY_DAILY, ...delta })
    .onConflictDoUpdate((row) => addCounters(row, delta));
}

type AccountCounters = Omit<typeof account.$inferSelect, "address">;
const EMPTY_ACCOUNT: AccountCounters = {
  createdCount: 0,
  creatorFeesAccruedEth: 0n,
  creatorFeesClaimedEth: 0n,
  tradesCount: 0,
};

export async function bumpAccount(db: Db, address: Hex, delta: Partial<AccountCounters>) {
  await db
    .insert(account)
    .values({ address, ...EMPTY_ACCOUNT, ...delta })
    .onConflictDoUpdate((row) => addCounters(row, delta));
}

function addCounters<T extends Record<string, unknown>>(row: T, delta: Partial<Record<keyof T, bigint | number>>) {
  const out: Record<string, bigint | number> = {};
  for (const [k, v] of Object.entries(delta)) {
    if (v === undefined) continue;
    out[k] = typeof v === "bigint" ? (row[k] as bigint) + v : (row[k] as number) + (v as number);
  }
  return out as Partial<T>;
}

/**
 * Updates all six candle intervals for one trade. A new bucket opens at the price before the trade
 * (`prevPrice`), so consecutive candles connect and the first candle of a token starts at the launch price.
 */
export async function upsertCandles(
  db: Db,
  token: Hex,
  ts: number,
  prevPrice: bigint,
  price: bigint,
  volumeEth: bigint,
) {
  const hi = price > prevPrice ? price : prevPrice;
  const lo = price < prevPrice ? price : prevPrice;
  for (const [interval, secs] of INTERVALS) {
    const time = ts - (ts % secs);
    await db
      .insert(candle)
      .values({ token, interval, time, open: prevPrice, high: hi, low: lo, close: price, volumeEth, trades: 1 })
      .onConflictDoUpdate((row) => ({
        high: row.high > price ? row.high : price,
        low: row.low < price ? row.low : price,
        close: price,
        volumeEth: row.volumeEth + volumeEth,
        trades: row.trades + 1,
      }));
  }
}

/**
 * Fast pre-filter for PoolManager swaps: a superset of graduated Lancio pool ids.
 * Loaded from the db on first use (after a restart), extended by the Graduated handler.
 * Callers still confirm with db.find(pool) — after a reorg the set may hold a stale id.
 */
let knownPools: Set<string> | null = null;

export async function maybeLancioPool(db: Db, poolId: Hex): Promise<boolean> {
  if (knownPools === null) {
    const rows = await db.sql.select({ poolId: pool.poolId }).from(pool);
    knownPools = new Set(rows.map((r) => r.poolId));
  }
  return knownPools.has(poolId);
}

export function rememberPool(poolId: Hex) {
  knownPools?.add(poolId);
}
