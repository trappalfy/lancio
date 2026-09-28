/**
 * Applies decoded Lancio events to the indexer tables. Handler logic mirrors the Ponder indexer
 * (indexer/src/{launchpad,token,pool,locker}.ts) one to one; keep them in sync.
 *
 * All rows touched by a batch are loaded once, changed in memory and written back by `flush()` in the
 * sync transaction, so a batch costs a handful of queries however many events it holds.
 */
import {
  INITIAL_CURVE,
  mcapWeiOf,
  POOL_SQRT_PRICE_X96,
  priceWeiOf,
  progressBpsOf,
  splitFee,
} from "@lancio/shared";
import { launchpadAbi, lockerAbi, poolManagerAbi, tokenAbi } from "@lancio/shared/abi";
import { and, getTableColumns, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getAbiItem, type ParseEventLogsReturnType } from "viem";
import type { IxDb } from "./db";
import {
  account,
  candle,
  dailyStats,
  holder,
  pool,
  token,
  trade,
  type AccountRow,
  type CandleRow,
  type DailyRow,
  type HolderRow,
  type PoolRow,
  type TokenRow,
  type TradeRow,
} from "./schema";
import {
  chunk,
  dayKey,
  dayStartOf,
  INTERVALS,
  isCountedHolder,
  lc,
  mcapFromPrice,
  poolPriceWei,
  ZERO_ADDRESS,
  type Hex,
} from "./shared";

export const transferEvent = getAbiItem({ abi: tokenAbi, name: "Transfer" });
export const swapEvent = getAbiItem({ abi: poolManagerAbi, name: "Swap" });
export const ABIS = {
  launchpad: launchpadAbi,
  locker: lockerAbi,
  token: [transferEvent],
  pool: [swapEvent],
} as const;

type Decoded<A extends (typeof ABIS)[keyof typeof ABIS]> = ParseEventLogsReturnType<A, undefined, true>[number];

/** A decoded log plus what the handlers need from its block and transaction. */
export type Ev = (Decoded<typeof launchpadAbi> | Decoded<typeof lockerAbi> | Decoded<typeof ABIS.token> | Decoded<typeof ABIS.pool>) & {
  block: number;
  index: number;
  ts: number;
  txHash: Hex;
  /** transaction.from — fetched for pool swaps only (the trader). */
  txFrom: Hex | null;
};

/* ------------------------------------------------------------------ row cache */

/** Rows keyed by string: loaded on first use (null = known missing), written back when marked dirty. */
class Rows<R> {
  private rows = new Map<string, R | null>();
  private dirty = new Set<string>();
  constructor(private load: (keys: string[]) => Promise<[string, R][]>) {}

  async preload(keys: Iterable<string>) {
    const missing = [...new Set(keys)].filter((k) => !this.rows.has(k));
    if (missing.length === 0) return;
    for (const k of missing) this.rows.set(k, null);
    for (const [k, r] of await this.load(missing)) this.rows.set(k, r);
  }

  async get(key: string): Promise<R | undefined> {
    if (!this.rows.has(key)) await this.preload([key]);
    return this.rows.get(key) ?? undefined;
  }

  put(key: string, row: R) {
    this.rows.set(key, row);
    this.dirty.add(key);
  }

  changed(): R[] {
    return [...this.dirty].map((k) => this.rows.get(k)!);
  }
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const holderKey = (tokenAddr: string, acct: string) => `${tokenAddr}:${acct}`;
const candleKey = (tokenAddr: string, interval: string, time: number) => `${tokenAddr}|${interval}|${time}`;

async function selectIn<R>(keys: string[], query: (part: string[]) => Promise<R[]>): Promise<R[]> {
  return (await Promise.all(chunk(keys, 500).map(query))).flat();
}

/* ------------------------------------------------------------------ counters */

type DailyCounters = Omit<DailyRow, "day" | "dayStart">;
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

type AccountCounters = Omit<AccountRow, "address">;
const EMPTY_ACCOUNT: AccountCounters = {
  createdCount: 0,
  creatorFeesAccruedEth: 0n,
  creatorFeesClaimedEth: 0n,
  tradesCount: 0,
};

function addCounters<T extends object>(row: T, delta: Partial<Record<keyof T, bigint | number>>): T {
  const out = { ...row } as Record<string, unknown>;
  for (const [k, v] of Object.entries(delta)) {
    if (v === undefined) continue;
    out[k] = typeof v === "bigint" ? (out[k] as bigint) + v : (out[k] as number) + (v as number);
  }
  return out as T;
}

const PIPS = 1_000_000n;
const abs = (x: bigint) => (x < 0n ? -x : x);

/* ------------------------------------------------------------------ batch */

export class Batch {
  readonly tokens: Rows<TokenRow>;
  readonly holders: Rows<HolderRow>;
  readonly accounts: Rows<AccountRow>;
  readonly candles: Rows<CandleRow>;
  readonly daily: Rows<DailyRow>;
  readonly pools: Rows<PoolRow>;
  readonly trades: TradeRow[] = [];

  constructor(private db: IxDb) {
    this.tokens = new Rows(async (keys) =>
      (await selectIn(keys, (p) => db.select().from(token).where(inArray(token.address, p as Hex[])))).map((r) => [r.address, r]),
    );
    this.holders = new Rows(async (keys) => {
      const want = new Set(keys);
      const pairs = keys.map((k) => k.split(":") as [Hex, Hex]);
      const tokens = uniq(pairs.map((p) => p[0]));
      const rows = await selectIn(uniq(pairs.map((p) => p[1])), (accts) =>
        db
          .select()
          .from(holder)
          .where(and(inArray(holder.token, tokens), inArray(holder.account, accts as Hex[]))),
      );
      return rows.map((r) => [holderKey(r.token, r.account), r] as [string, HolderRow]).filter(([k]) => want.has(k));
    });
    this.accounts = new Rows(async (keys) =>
      (await selectIn(keys, (p) => db.select().from(account).where(inArray(account.address, p as Hex[])))).map((r) => [r.address, r]),
    );
    this.candles = new Rows(async (keys) => {
      const want = new Set(keys);
      const parts = keys.map((k) => k.split("|"));
      const rows = await db
        .select()
        .from(candle)
        .where(
          and(
            inArray(candle.token, uniq(parts.map((p) => p[0] as Hex))),
            inArray(candle.time, uniq(parts.map((p) => Number(p[2])))),
          ),
        );
      return rows.map((r) => [candleKey(r.token, r.interval, r.time), r] as [string, CandleRow]).filter(([k]) => want.has(k));
    });
    this.daily = new Rows(async (keys) =>
      (await db.select().from(dailyStats).where(inArray(dailyStats.day, keys))).map((r) => [r.day, r]),
    );
    this.pools = new Rows(async (keys) =>
      (await selectIn(keys, (p) => db.select().from(pool).where(inArray(pool.poolId, p as Hex[])))).map((r) => [r.poolId, r]),
    );
  }

  /** Bulk-loads the rows the events will obviously touch (the rest load on first use). */
  async preload(events: Ev[]) {
    const tokens: string[] = [];
    const holders: string[] = [];
    const accounts: string[] = [];
    const pools: string[] = [];
    for (const ev of events) {
      if (ev.eventName === "Transfer") {
        const t = lc(ev.address);
        tokens.push(t);
        holders.push(holderKey(t, lc(ev.args.from)), holderKey(t, lc(ev.args.to)));
      } else if (ev.eventName === "Swap") {
        pools.push(lc(ev.args.id));
        if (ev.txFrom) accounts.push(ev.txFrom);
      } else if (ev.eventName === "Trade") {
        tokens.push(lc(ev.args.token));
        accounts.push(lc(ev.args.trader));
      } else if ("args" in ev && ev.args && "token" in ev.args) {
        tokens.push(lc(ev.args.token as string));
      }
    }
    await Promise.all([this.tokens.preload(tokens), this.holders.preload(holders), this.accounts.preload(accounts), this.pools.preload(pools)]);
  }

  private async bumpDaily(ts: number, delta: Partial<DailyCounters>) {
    const dayStart = dayStartOf(ts);
    const day = dayKey(dayStart);
    const row = (await this.daily.get(day)) ?? { day, dayStart, ...EMPTY_DAILY };
    this.daily.put(day, addCounters(row, delta));
  }

  private async bumpAccount(address: Hex, delta: Partial<AccountCounters>) {
    const row = (await this.accounts.get(address)) ?? { address, ...EMPTY_ACCOUNT };
    this.accounts.put(address, addCounters(row, delta));
  }

  /**
   * Updates all six candle intervals for one trade. A new bucket opens at the price before the trade
   * (`prevPrice`), so consecutive candles connect and the first candle of a token starts at the launch price.
   */
  private async upsertCandles(tokenAddr: Hex, ts: number, prevPrice: bigint, price: bigint, volumeEth: bigint) {
    const hi = price > prevPrice ? price : prevPrice;
    const lo = price < prevPrice ? price : prevPrice;
    const keys = INTERVALS.map(([interval, secs]) => [interval, ts - (ts % secs)] as const);
    await this.candles.preload(keys.map(([i, t]) => candleKey(tokenAddr, i, t)));
    for (const [interval, time] of keys) {
      const key = candleKey(tokenAddr, interval, time);
      const row = await this.candles.get(key);
      this.candles.put(
        key,
        row
          ? {
              ...row,
              high: row.high > price ? row.high : price,
              low: row.low < price ? row.low : price,
              close: price,
              volumeEth: row.volumeEth + volumeEth,
              trades: row.trades + 1,
            }
          : { token: tokenAddr, interval, time, open: prevPrice, high: hi, low: lo, close: price, volumeEth, trades: 1 },
      );
    }
  }

  private async mustToken(address: Hex, ev: Ev): Promise<TokenRow> {
    const t = await this.tokens.get(address);
    if (!t) throw new Error(`${ev.eventName} for unknown token ${address} in tx ${ev.txHash}`);
    return t;
  }

  async apply(ev: Ev) {
    const ts = ev.ts;
    switch (ev.eventName) {
      case "TokenCreated": {
        const address = lc(ev.args.token);
        const creator = lc(ev.args.creator);
        // The token's constructor mint (and, depending on emit order, the dev buy) is applied before this
        // event. The only non-excluded address that can already hold tokens here is the creator.
        const creatorHolding = await this.holders.get(holderKey(address, creator));
        const holdersCount = creatorHolding && creatorHolding.balance > 0n && isCountedHolder(creator) ? 1 : 0;
        this.tokens.put(address, {
          address,
          name: ev.args.name,
          symbol: ev.args.symbol,
          creator,
          createdAt: ts,
          createdBlock: Number(ev.args.createdBlock),
          createdTx: ev.txHash,
          status: "curve",
          metadataUri: ev.args.metadataURI,
          description: null,
          image: null,
          x: null,
          telegram: null,
          website: null,
          metaPending: true,
          metaAttempts: 0,
          vEth: INITIAL_CURVE.vEth,
          vTok: INITIAL_CURVE.vTok,
          realEth: 0n,
          progressBps: 0,
          priceEth: priceWeiOf(INITIAL_CURVE),
          mcapEth: mcapWeiOf(INITIAL_CURVE),
          volumeEthAll: 0n,
          tradesCount: 0,
          holdersCount,
          lastBuyAt: null,
          lastTradeAt: null,
          graduatedAt: null,
          poolId: null,
          creatorFeesAccruedEth: 0n,
          creatorFeesClaimedEth: 0n,
          poolTokenFeesCreator: 0n,
          poolTokenFeesProtocol: 0n,
        });
        const prev = await this.accounts.get(creator);
        await this.bumpAccount(creator, { createdCount: 1 });
        await this.bumpDaily(ts, { launches: 1, newCreators: prev && prev.createdCount > 0 ? 0 : 1 });
        return;
      }

      case "Trade": {
        const address = lc(ev.args.token);
        // Curve trades always follow TokenCreated (the contract emits TokenCreated before the dev buy).
        const t = await this.mustToken(address, ev);
        const { isBuy, ethAmount, tokenAmount, fee, vEth, vTok, realEth } = ev.args;
        const trader = lc(ev.args.trader);
        const state = { vEth, vTok };
        const price = priceWeiOf(state);
        const { creatorFee, protocolFee } = splitFee(fee);

        this.trades.push({
          id: `${ev.txHash}-${ev.index}`,
          token: address,
          trader,
          side: isBuy ? "buy" : "sell",
          ethAmount,
          tokenAmount,
          feeEth: fee,
          priceEth: price,
          source: "curve",
          txHash: ev.txHash,
          blockNumber: ev.block,
          logIndex: ev.index,
          timestamp: ts,
        });
        this.tokens.put(address, {
          ...t,
          vEth,
          vTok,
          realEth,
          progressBps: Math.min(10_000, Math.max(0, progressBpsOf(state))),
          priceEth: price,
          mcapEth: mcapWeiOf(state),
          volumeEthAll: t.volumeEthAll + ethAmount,
          tradesCount: t.tradesCount + 1,
          lastTradeAt: ts,
          lastBuyAt: isBuy ? ts : t.lastBuyAt,
          creatorFeesAccruedEth: t.creatorFeesAccruedEth + creatorFee,
        });

        if (creatorFee > 0n) await this.bumpAccount(t.creator, { creatorFeesAccruedEth: creatorFee });
        await this.bumpAccount(trader, { tradesCount: 1 });
        await this.bumpDaily(ts, {
          volumeEth: ethAmount,
          curveVolumeEth: ethAmount,
          trades: 1,
          curveCreatorsEth: creatorFee,
          curveProtocolEth: protocolFee,
        });
        await this.upsertCandles(address, ts, t.priceEth, price, ethAmount);
        return;
      }

      case "Graduated": {
        const address = lc(ev.args.token);
        const poolId = lc(ev.args.poolId);
        // The pool opens at a fixed price (POOL_SQRT_PRICE_X96 = 4e-8 ETH/token); swaps move it from there.
        const price = poolPriceWei(POOL_SQRT_PRICE_X96);
        if (!(await this.pools.get(poolId))) {
          this.pools.put(poolId, {
            poolId,
            token: address,
            liquidity: ev.args.liquidity,
            ethIn: ev.args.ethIn,
            tokensIn: ev.args.tokensIn,
            createdAt: ts,
          });
        }
        const t = await this.mustToken(address, ev);
        this.tokens.put(address, {
          ...t,
          status: "graduated",
          graduatedAt: ts,
          poolId,
          progressBps: 10_000,
          priceEth: price,
          mcapEth: mcapFromPrice(price),
        });
        await this.bumpDaily(ts, { graduations: 1, lockedLiquidityEth: ev.args.ethIn });
        return;
      }

      case "CreatorFeesClaimed": {
        const address = lc(ev.args.token);
        const t = await this.mustToken(address, ev);
        this.tokens.put(address, { ...t, creatorFeesClaimedEth: t.creatorFeesClaimedEth + ev.args.amount });
        await this.bumpAccount(lc(ev.args.creator), { creatorFeesClaimedEth: ev.args.amount });
        return;
      }

      case "CreatorTransferred": {
        const address = lc(ev.args.token);
        const t = await this.mustToken(address, ev);
        this.tokens.put(address, { ...t, creator: lc(ev.args.to) });
        return;
      }

      // ETH side of pool fees, credited to pull balances 50/50 (the locker calls depositPoolFees).
      case "PoolFeesDeposited": {
        const address = lc(ev.args.token);
        const { creatorEth, protocolEth } = ev.args;
        const t = await this.mustToken(address, ev);
        this.tokens.put(address, { ...t, creatorFeesAccruedEth: t.creatorFeesAccruedEth + creatorEth });
        if (creatorEth > 0n) await this.bumpAccount(t.creator, { creatorFeesAccruedEth: creatorEth });
        await this.bumpDaily(ts, { poolCreatorsEth: creatorEth, poolProtocolEth: protocolEth });
        return;
      }

      case "ProtocolFeesClaimed":
        await this.bumpDaily(ts, { protocolClaimedEth: ev.args.amount });
        return;

      // Locker fee collection. The ETH part is also reported by PoolFeesDeposited (where it is credited),
      // so only the token-side payout is recorded here.
      case "PoolFeesCollected": {
        const { tokenToCreator, tokenToProtocol } = ev.args;
        if (tokenToCreator === 0n && tokenToProtocol === 0n) return;
        const address = lc(ev.args.token);
        const t = await this.mustToken(address, ev);
        this.tokens.put(address, {
          ...t,
          poolTokenFeesCreator: t.poolTokenFeesCreator + tokenToCreator,
          poolTokenFeesProtocol: t.poolTokenFeesProtocol + tokenToProtocol,
        });
        return;
      }

      // Holder balances for every Lancio token.
      case "Transfer": {
        const { value } = ev.args;
        if (value === 0n) return;
        const tokenAddr = lc(ev.address);
        const from = lc(ev.args.from);
        const to = lc(ev.args.to);
        let delta = 0;
        const move = async (acct: Hex, change: bigint) => {
          const key = holderKey(tokenAddr, acct);
          const prev = (await this.holders.get(key))?.balance ?? 0n;
          const next = prev + change;
          this.holders.put(key, { token: tokenAddr, account: acct, balance: next });
          if (isCountedHolder(acct)) {
            if (prev <= 0n && next > 0n) delta++;
            else if (prev > 0n && next <= 0n) delta--;
          }
        };
        if (from !== ZERO_ADDRESS) await move(from, -value);
        if (to !== ZERO_ADDRESS) await move(to, value);
        // The constructor mint is seen before TokenCreated (row missing); it only moves launchpad/zero, never counted.
        const t = delta !== 0 ? await this.tokens.get(tokenAddr) : undefined;
        if (t) this.tokens.put(tokenAddr, { ...t, holdersCount: t.holdersCount + delta });
        return;
      }

      /**
       * Uniswap v4 swaps in graduated Lancio pools (currency0 = native ETH, currency1 = token).
       * Amounts are the swapper's deltas: negative = paid by the swapper, so a token buy has amount0 < 0.
       * ethAmount = |amount0|; feeEth: buy → ethAmount · fee / 1e6, sell → ethOut · fee / (1e6 − fee).
       * trader = transaction.from (the router is the PoolManager-level sender).
       */
      case "Swap": {
        const p = await this.pools.get(lc(ev.args.id));
        if (!p) return;
        const t = await this.tokens.get(p.token);
        if (!t) return;
        const { amount0, amount1, sqrtPriceX96, fee } = ev.args;
        const ethAmount = abs(amount0);
        const tokenAmount = abs(amount1);
        if (ethAmount === 0n && tokenAmount === 0n) return;
        if (!ev.txFrom) throw new Error(`Swap without transaction sender in tx ${ev.txHash}`);

        const isBuy = amount0 < 0n;
        const feePips = BigInt(fee);
        const feeEth = isBuy ? (ethAmount * feePips) / PIPS : feePips < PIPS ? (ethAmount * feePips) / (PIPS - feePips) : 0n;
        const price = sqrtPriceX96 > 0n ? poolPriceWei(sqrtPriceX96) : t.priceEth;
        const trader = ev.txFrom;

        this.trades.push({
          id: `${ev.txHash}-${ev.index}`,
          token: t.address,
          trader,
          side: isBuy ? "buy" : "sell",
          ethAmount,
          tokenAmount,
          feeEth,
          priceEth: price,
          source: "pool",
          txHash: ev.txHash,
          blockNumber: ev.block,
          logIndex: ev.index,
          timestamp: ts,
        });
        this.tokens.put(t.address, {
          ...t,
          priceEth: price,
          mcapEth: mcapFromPrice(price),
          volumeEthAll: t.volumeEthAll + ethAmount,
          tradesCount: t.tradesCount + 1,
          lastTradeAt: ts,
          lastBuyAt: isBuy ? ts : t.lastBuyAt,
        });
        await this.bumpAccount(trader, { tradesCount: 1 });
        await this.bumpDaily(ts, { volumeEth: ethAmount, poolVolumeEth: ethAmount, trades: 1 });
        await this.upsertCandles(t.address, ts, t.priceEth, price, ethAmount);
        return;
      }

      default:
        return; // OwnershipTransferred, TreasuryUpdated, CreationPausedSet, … — not indexed
    }
  }

  /** Writes every changed row. Run inside the sync transaction. */
  async flush(db: IxDb) {
    await upsert(db, token, this.tokens.changed(), [token.address]);
    await upsert(db, holder, this.holders.changed(), [holder.token, holder.account]);
    await upsert(db, account, this.accounts.changed(), [account.address]);
    await upsert(db, candle, this.candles.changed(), [candle.token, candle.interval, candle.time]);
    await upsert(db, dailyStats, this.daily.changed(), [dailyStats.day]);
    await upsert(db, pool, this.pools.changed(), [pool.poolId]);
    for (const part of chunk(this.trades, 200)) await db.insert(trade).values(part).onConflictDoNothing();
  }
}

/** INSERT … ON CONFLICT (pk) DO UPDATE SET every other column = excluded. */
async function upsert<T extends PgTable>(db: IxDb, table: T, rows: T["$inferInsert"][], target: PgColumn[]) {
  if (rows.length === 0) return;
  const set = Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([, c]) => !target.includes(c))
      .map(([k, c]) => [k, sql.raw(`excluded."${c.name}"`)]),
  ) as PgUpdateSetSource<T>;
  for (const part of chunk(rows, 200)) {
    await db.insert(table).values(part).onConflictDoUpdate({ target, set });
  }
}
