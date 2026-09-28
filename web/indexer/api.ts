/**
 * REST API of the built-in indexer — shapes in packages/shared/src/api-types.ts, same routes as the Ponder
 * indexer (copied from indexer/src/api/index.ts). Served same-origin under /api (app/api/{tokens,stats,accounts,
 * search,top}) and called in-process by server components (server.ts). Bigints are decimal strings, addresses
 * lowercase. Rolling windows are computed per request from `trade`. /api/eth-usd is app/api/eth-usd/route.ts.
 */
import { Hono } from "hono";
import { and, asc, count, desc, eq, gt, gte, lte, min, sql, sum } from "drizzle-orm";
import { TOTAL_SUPPLY } from "@lancio/shared";
import type {
  AccountResponse,
  CandlesResponse,
  DailyResponse,
  HoldersResponse,
  HoldingsResponse,
  Interval,
  ProtocolStats,
  SortKey,
  TokenStatus,
  TokensResponse,
  WindowKey,
} from "@lancio/shared";
import { ixDb, type IxDb } from "./db";
import { account, candle, dailyStats, holder, token, trade } from "./schema";
import { DAY, dayKey, dayStartOf, INTERVALS, LAUNCHPAD, POOL_MANAGER, type Hex } from "./shared";
import {
  big,
  hydrate,
  hydrateDetail,
  listTrades,
  nowSec,
  num,
  pctChange,
  searchCondition,
  type SQL,
  type TokenRow,
} from "./queries";

const app = new Hono();

// ---------- params ----------

const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
  v !== undefined && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const intParam = (v: string | undefined, fallback: number, lo: number, hi: number) => {
  const n = v === undefined || v === "" ? NaN : Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

const addressParam = (v: string): Hex | null => (/^0x[0-9a-fA-F]{40}$/.test(v) ? (v.toLowerCase() as Hex) : null);

const SORTS: readonly SortKey[] = ["recentBuys", "newest", "oldest", "marketCap", "volume"];
const WINDOWS: readonly WindowKey[] = ["all", "24h", "7d"];
const STATUSES: readonly (TokenStatus | "all")[] = ["all", "curve", "graduated"];
const INTERVAL_KEYS = INTERVALS.map(([k]) => k) as readonly Interval[];

const badAddress = { error: "invalid_address" } as const;
const notFound = { error: "not_found" } as const;

// ---------- tokens ----------

app.get("/api/tokens", async (c) => {
  const db = await ixDb();
  const status = oneOf(c.req.query("status"), STATUSES, "all");
  const sort = oneOf(c.req.query("sort"), SORTS, "recentBuys");
  const window = oneOf(c.req.query("window"), WINDOWS, "all");
  const page = intParam(c.req.query("page"), 1, 1, 10_000);
  const pageSize = intParam(c.req.query("pageSize"), 25, 1, 100);
  const offset = (page - 1) * pageSize;
  const q = c.req.query("q");

  const conds: (SQL | undefined)[] = [];
  if (status !== "all") conds.push(eq(token.status, status));
  if (q) conds.push(searchCondition(q));
  const cutoff = window === "all" ? null : nowSec() - (window === "24h" ? DAY : 7 * DAY);

  let rows: TokenRow[];
  let total: number;

  if (sort === "volume" && cutoff !== null) {
    // Rank by volume inside the window; tokens without trades in it are left out.
    const vol = db
      .select({ token: trade.token, vol: sql<string>`sum(${trade.ethAmount})`.as("vol") })
      .from(trade)
      .where(gte(trade.timestamp, cutoff))
      .groupBy(trade.token)
      .as("vol");
    const where = and(...conds);
    const [list, [agg]] = await Promise.all([
      db
        .select({ t: token })
        .from(token)
        .innerJoin(vol, eq(vol.token, token.address))
        .where(where)
        .orderBy(desc(vol.vol), desc(token.mcapEth), asc(token.address))
        .limit(pageSize)
        .offset(offset),
      db.select({ n: count() }).from(token).innerJoin(vol, eq(vol.token, token.address)).where(where),
    ]);
    rows = list.map((r) => r.t);
    total = num(agg?.n);
  } else {
    // Window: recentBuys → bought within it; newest/oldest/marketCap → launched within it.
    if (cutoff !== null) conds.push(sort === "recentBuys" ? gte(token.lastBuyAt, cutoff) : gte(token.createdAt, cutoff));
    const orderBy = {
      recentBuys: [sql`${token.lastBuyAt} desc nulls last`, desc(token.createdAt)],
      newest: [desc(token.createdAt), desc(token.createdBlock)],
      oldest: [asc(token.createdAt), asc(token.createdBlock)],
      marketCap: [desc(token.mcapEth), desc(token.createdAt)],
      volume: [desc(token.volumeEthAll), desc(token.createdAt)],
    }[sort];
    const where = and(...conds);
    const [list, [agg]] = await Promise.all([
      db
        .select()
        .from(token)
        .where(where)
        .orderBy(...orderBy, asc(token.address))
        .limit(pageSize)
        .offset(offset),
      db.select({ n: count() }).from(token).where(where),
    ]);
    rows = list;
    total = num(agg?.n);
  }

  const body: TokensResponse = { items: await hydrate(db, rows), total, page, pageSize };
  return c.json(body);
});

app.get("/api/tokens/:address", async (c) => {
  const db = await ixDb();
  const address = addressParam(c.req.param("address"));
  if (!address) return c.json(badAddress, 400);
  const [row] = await db.select().from(token).where(eq(token.address, address)).limit(1);
  if (!row) return c.json(notFound, 404);
  return c.json(await hydrateDetail(db, row));
});

app.get("/api/tokens/:address/candles", async (c) => {
  const db = await ixDb();
  const address = addressParam(c.req.param("address"));
  if (!address) return c.json(badAddress, 400);
  const interval = oneOf(c.req.query("interval"), INTERVAL_KEYS, "1m");
  const from = intParam(c.req.query("from"), 0, 0, Number.MAX_SAFE_INTEGER);
  const to = intParam(c.req.query("to"), 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = intParam(c.req.query("limit"), 1000, 1, 2000);

  const conds: (SQL | undefined)[] = [eq(candle.token, address), eq(candle.interval, interval)];
  if (from) conds.push(gte(candle.time, from));
  if (to) conds.push(lte(candle.time, to));
  // Latest `limit` buckets in the range, returned ascending.
  const rows = await db
    .select()
    .from(candle)
    .where(and(...conds))
    .orderBy(desc(candle.time))
    .limit(limit);

  const body: CandlesResponse = rows.reverse().map((r) => ({
    time: r.time,
    open: r.open.toString(),
    high: r.high.toString(),
    low: r.low.toString(),
    close: r.close.toString(),
    volumeEth: r.volumeEth.toString(),
  }));
  return c.json(body);
});

app.get("/api/tokens/:address/trades", async (c) => {
  const db = await ixDb();
  const address = addressParam(c.req.param("address"));
  if (!address) return c.json(badAddress, 400);
  const limit = intParam(c.req.query("limit"), 50, 1, 200);
  return c.json(await listTrades(db, eq(trade.token, address), limit, c.req.query("before")));
});

app.get("/api/tokens/:address/holders", async (c) => {
  const db = await ixDb();
  const address = addressParam(c.req.param("address"));
  if (!address) return c.json(badAddress, 400);
  const limit = intParam(c.req.query("limit"), 20, 1, 100);
  const [row] = await db.select({ creator: token.creator }).from(token).where(eq(token.address, address)).limit(1);
  if (!row) return c.json(notFound, 404);

  const rows = await db
    .select({ account: holder.account, balance: holder.balance })
    .from(holder)
    .where(and(eq(holder.token, address), gt(holder.balance, 0n)))
    .orderBy(desc(holder.balance), asc(holder.account))
    .limit(limit);

  const body: HoldersResponse = rows.map((h) => ({
    account: h.account,
    balance: h.balance.toString(),
    shareBps: Number((h.balance * 10_000n) / TOTAL_SUPPLY),
    label:
      h.account === LAUNCHPAD ? "curve" : h.account === POOL_MANAGER ? "pool" : h.account === row.creator ? "creator" : null,
  }));
  return c.json(body);
});

// ---------- protocol stats ----------

async function completedDays(db: IxDb) {
  const today = dayStartOf(nowSec());
  const [r] = await db.select({ first: min(dailyStats.dayStart) }).from(dailyStats);
  const first = r?.first == null ? null : num(r.first);
  // A day is "complete" once it has ended; there is none until the first active UTC day closes.
  const latest = first !== null && first < today ? today - DAY : null;
  return { today, latest };
}

app.get("/api/stats", async (c) => {
  const db = await ixDb();
  const window = c.req.query("window") === "all" ? "all" : "24h";
  const { latest } = await completedDays(db);

  const [creators] = await db.select({ n: count() }).from(account).where(gt(account.createdCount, 0));
  const lifetimeSums = {
    volumeEth: sum(dailyStats.volumeEth),
    launches: sum(dailyStats.launches),
    graduations: sum(dailyStats.graduations),
    curveCreatorsEth: sum(dailyStats.curveCreatorsEth),
    curveProtocolEth: sum(dailyStats.curveProtocolEth),
    poolCreatorsEth: sum(dailyStats.poolCreatorsEth),
    poolProtocolEth: sum(dailyStats.poolProtocolEth),
    lockedLiquidityEth: sum(dailyStats.lockedLiquidityEth),
  };
  const [life] = await db.select(lifetimeSums).from(dailyStats);

  let d = {
    volumeEth: big(life?.volumeEth),
    launches: num(life?.launches),
    graduations: num(life?.graduations),
    curveCreatorsEth: big(life?.curveCreatorsEth),
    curveProtocolEth: big(life?.curveProtocolEth),
    poolCreatorsEth: big(life?.poolCreatorsEth),
    poolProtocolEth: big(life?.poolProtocolEth),
  };
  let volumeChangePct: number | null = null;
  let launchesChangePct: number | null = null;

  if (window === "24h") {
    const rows =
      latest === null
        ? []
        : await db
            .select()
            .from(dailyStats)
            .where(and(gte(dailyStats.dayStart, latest - DAY), lte(dailyStats.dayStart, latest)));
    const day = rows.find((r) => r.dayStart === latest);
    const prior = rows.find((r) => r.dayStart === latest! - DAY);
    d = {
      volumeEth: day?.volumeEth ?? 0n,
      launches: day?.launches ?? 0,
      graduations: day?.graduations ?? 0,
      curveCreatorsEth: day?.curveCreatorsEth ?? 0n,
      curveProtocolEth: day?.curveProtocolEth ?? 0n,
      poolCreatorsEth: day?.poolCreatorsEth ?? 0n,
      poolProtocolEth: day?.poolProtocolEth ?? 0n,
    };
    if (latest !== null) {
      volumeChangePct = pctChange(d.volumeEth, prior?.volumeEth ?? 0n);
      launchesChangePct = pctChange(BigInt(d.launches), BigInt(prior?.launches ?? 0));
    }
  }

  const body: ProtocolStats = {
    window,
    updatedAt: nowSec(),
    latestCompleteDay: latest === null ? null : dayKey(latest),
    volumeEth: d.volumeEth.toString(),
    volumeChangePct,
    launches: d.launches,
    launchesChangePct,
    graduations: d.graduations,
    uniqueCreators: num(creators?.n),
    fees: {
      creatorsEth: (d.curveCreatorsEth + d.poolCreatorsEth).toString(),
      protocolEth: (d.curveProtocolEth + d.poolProtocolEth).toString(),
      curveCreatorsEth: d.curveCreatorsEth.toString(),
      curveProtocolEth: d.curveProtocolEth.toString(),
      poolCreatorsEth: d.poolCreatorsEth.toString(),
      poolProtocolEth: d.poolProtocolEth.toString(),
      // A stock, not a flow: total ETH locked in graduated pools, same for both windows.
      lockedLiquidityEth: big(life?.lockedLiquidityEth).toString(),
    },
  };
  return c.json(body);
});

app.get("/api/stats/daily", async (c) => {
  const db = await ixDb();
  const days = intParam(c.req.query("days"), 14, 1, 365);
  const { latest } = await completedDays(db);
  if (latest === null) return c.json([] satisfies DailyResponse);

  const start = latest - (days - 1) * DAY;
  const rows = await db
    .select()
    .from(dailyStats)
    .where(and(gte(dailyStats.dayStart, start), lte(dailyStats.dayStart, latest)));
  const byDay = new Map(rows.map((r) => [r.dayStart, r]));

  const body: DailyResponse = [];
  for (let t = start; t <= latest; t += DAY) {
    const r = byDay.get(t);
    body.push({
      day: dayKey(t),
      volumeEth: (r?.volumeEth ?? 0n).toString(),
      launches: r?.launches ?? 0,
      graduations: r?.graduations ?? 0,
    });
  }
  return c.json(body);
});

// ---------- accounts ----------

app.get("/api/accounts/:address", async (c) => {
  const db = await ixDb();
  const address = addressParam(c.req.param("address"));
  if (!address) return c.json(badAddress, 400);
  const [[acc], created] = await Promise.all([
    db.select().from(account).where(eq(account.address, address)).limit(1),
    db.select().from(token).where(eq(token.creator, address)).orderBy(desc(token.createdAt)).limit(200),
  ]);
  const body: AccountResponse = {
    address,
    created: await hydrate(db, created),
    creatorFeesAccruedEth: (acc?.creatorFeesAccruedEth ?? 0n).toString(),
    creatorFeesClaimedEth: (acc?.creatorFeesClaimedEth ?? 0n).toString(),
    tradesCount: acc?.tradesCount ?? 0,
  };
  return c.json(body);
});

app.get("/api/accounts/:address/holdings", async (c) => {
  const db = await ixDb();
  const address = addressParam(c.req.param("address"));
  if (!address) return c.json(badAddress, 400);
  const rows = await db
    .select({ t: token, balance: holder.balance })
    .from(holder)
    .innerJoin(token, eq(token.address, holder.token))
    .where(and(eq(holder.account, address), gt(holder.balance, 0n)))
    .orderBy(sql`${holder.balance} * ${token.priceEth} desc`, asc(token.address))
    .limit(200);
  const summaries = await hydrate(db, rows.map((r) => r.t));
  const body: HoldingsResponse = rows.map((r, i) => ({ token: summaries[i]!, balance: r.balance.toString() }));
  return c.json(body);
});

app.get("/api/accounts/:address/trades", async (c) => {
  const db = await ixDb();
  const address = addressParam(c.req.param("address"));
  if (!address) return c.json(badAddress, 400);
  const limit = intParam(c.req.query("limit"), 50, 1, 200);
  return c.json(await listTrades(db, eq(trade.trader, address), limit, c.req.query("before")));
});

// ---------- search / top / eth-usd ----------

app.get("/api/search", async (c) => {
  const db = await ixDb();
  const cond = searchCondition(c.req.query("q") ?? "");
  if (!cond) return c.json([]);
  const rows = await db.select().from(token).where(cond).orderBy(desc(token.mcapEth), asc(token.address)).limit(10);
  return c.json(await hydrate(db, rows));
});

app.get("/api/top", async (c) => {
  const db = await ixDb();
  const limit = intParam(c.req.query("limit"), 10, 1, 50);
  const rows = await db.select().from(token).orderBy(desc(token.mcapEth), asc(token.address)).limit(limit);
  return c.json(await hydrate(db, rows));
});

app.notFound((c) => c.json(notFound, 404));

app.onError((err, c) => {
  console.error("[lancio-indexer] api error:", err);
  return c.json({ error: "internal" }, 500);
});

export default app;
