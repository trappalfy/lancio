/** Read-side helpers for the REST API: row → API shape, rolling windows computed over `trade`. */
import { db } from "ponder:api";
import { token, trade } from "ponder:schema";
import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "ponder";
import { INITIAL_CURVE, priceWeiOf } from "@lancio/shared";
import type { Hex, TokenDetail, TokenSummary, Trade, TradesResponse } from "@lancio/shared";

export type SQL = NonNullable<ReturnType<typeof and>>;
export type TokenRow = typeof token.$inferSelect;
type TradeRow = typeof trade.$inferSelect;

export const nowSec = () => Math.floor(Date.now() / 1000);
const INITIAL_PRICE = priceWeiOf(INITIAL_CURVE);

/** Numeric/int8 aggregates come back as string (pg) or number (PGlite) — normalise. */
export const big = (v: unknown) => BigInt(v == null ? 0 : String(v));
export const num = (v: unknown) => Number(v ?? 0);

/** Percent change with 2-decimal precision; null when the base is zero. */
export function pctChange(now: bigint, base: bigint): number | null {
  if (base === 0n) return null;
  return Number(((now - base) * 1_000_000n) / base) / 10_000;
}

type Rolling = { v24: bigint; v7: bigint; ref: bigint | null };

/** 24h / 7d rolling volume and the reference price 24h ago, for a set of tokens (2 queries). */
async function rollingStats(addresses: Hex[]): Promise<Map<string, Rolling>> {
  const out = new Map<string, Rolling>();
  if (addresses.length === 0) return out;
  const now = nowSec();
  const c24 = now - 86_400;
  const c7 = now - 7 * 86_400;

  const [vols, refs] = await Promise.all([
    db
      .select({
        token: trade.token,
        v24: sql<string>`coalesce(sum(case when ${trade.timestamp} >= ${c24} then ${trade.ethAmount} else 0 end), 0)`,
        v7: sql<string>`coalesce(sum(${trade.ethAmount}), 0)`,
      })
      .from(trade)
      .where(and(inArray(trade.token, addresses), gte(trade.timestamp, c7)))
      .groupBy(trade.token),
    db
      .selectDistinctOn([trade.token], { token: trade.token, price: trade.priceEth })
      .from(trade)
      .where(and(inArray(trade.token, addresses), lt(trade.timestamp, c24)))
      .orderBy(trade.token, desc(trade.blockNumber), desc(trade.logIndex)),
  ]);

  for (const v of vols) out.set(v.token, { v24: big(v.v24), v7: big(v.v7), ref: null });
  for (const r of refs) {
    const cur = out.get(r.token) ?? { v24: 0n, v7: 0n, ref: null };
    cur.ref = r.price;
    out.set(r.token, cur);
  }
  return out;
}

function toSummary(r: TokenRow, roll: Rolling | undefined): TokenSummary {
  // Price 24h ago = last trade before the cutoff; with none, the token was still at its launch price.
  const ref = roll?.ref ?? INITIAL_PRICE;
  return {
    address: r.address,
    name: r.name,
    symbol: r.symbol,
    creator: r.creator,
    createdAt: r.createdAt,
    createdBlock: r.createdBlock,
    status: r.status,
    metadataUri: r.metadataUri,
    meta: {
      description: r.description,
      image: r.image,
      x: r.x,
      telegram: r.telegram,
      website: r.website,
    },
    vEth: r.vEth.toString(),
    vTok: r.vTok.toString(),
    realEth: r.realEth.toString(),
    progressBps: r.progressBps,
    priceEth: r.priceEth.toString(),
    mcapEth: r.mcapEth.toString(),
    volumeEth24h: (roll?.v24 ?? 0n).toString(),
    volumeEth7d: (roll?.v7 ?? 0n).toString(),
    volumeEthAll: r.volumeEthAll.toString(),
    change24hPct: pctChange(r.priceEth, ref),
    tradesCount: r.tradesCount,
    holdersCount: r.holdersCount,
    lastBuyAt: r.lastBuyAt,
    lastTradeAt: r.lastTradeAt,
    graduatedAt: r.graduatedAt,
    poolId: r.poolId,
  };
}

export async function hydrate(rows: TokenRow[]): Promise<TokenSummary[]> {
  const roll = await rollingStats(rows.map((r) => r.address));
  return rows.map((r) => toSummary(r, roll.get(r.address)));
}

export async function hydrateDetail(r: TokenRow): Promise<TokenDetail> {
  const [summary] = await hydrate([r]);
  return {
    ...summary!,
    creatorFeesAccruedEth: r.creatorFeesAccruedEth.toString(),
    creatorFeesClaimedEth: r.creatorFeesClaimedEth.toString(),
  };
}

/** Name/symbol prefix (case-insensitive, leading "$" ignored) or exact address. */
export function searchCondition(q: string): SQL | undefined {
  const s = q.trim().replace(/^\$/, "");
  if (!s) return undefined;
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return eq(token.address, s.toLowerCase() as Hex);
  const pattern = `${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return or(ilike(token.name, pattern), ilike(token.symbol, pattern));
}

function toTrade(r: TradeRow, symbol: string | null): Trade {
  return {
    id: r.id,
    txHash: r.txHash,
    blockNumber: r.blockNumber,
    timestamp: r.timestamp,
    token: r.token,
    ...(symbol ? { symbol } : {}),
    trader: r.trader,
    side: r.side,
    ethAmount: r.ethAmount.toString(),
    tokenAmount: r.tokenAmount.toString(),
    feeEth: r.feeEth.toString(),
    priceEth: r.priceEth.toString(),
    source: r.source,
  };
}

/** Newest first; cursor = "<blockNumber>_<logIndex>" of the last item returned. */
export async function listTrades(where: SQL, limit: number, before: string | undefined): Promise<TradesResponse> {
  const conds: (SQL | undefined)[] = [where];
  const m = before?.match(/^(\d+)_(\d+)$/);
  if (m) conds.push(sql`(${trade.blockNumber}, ${trade.logIndex}) < (${Number(m[1])}, ${Number(m[2])})`);

  const rows = await db
    .select({ t: trade, symbol: token.symbol })
    .from(trade)
    .leftJoin(token, eq(token.address, trade.token))
    .where(and(...conds))
    .orderBy(desc(trade.blockNumber), desc(trade.logIndex))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => toTrade(r.t, r.symbol)),
    nextCursor: rows.length > limit && last ? `${last.t.blockNumber}_${last.t.logIndex}` : null,
  };
}
