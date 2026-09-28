/**
 * Deterministic mock indexer (NEXT_PUBLIC_USE_MOCKS=true). Built with the shared curve math, so every
 * number (price, mcap, progress, fees) is exactly what the contracts would produce for these trades.
 * `?mock=empty` in the page URL → empty lists / 404 tokens, for empty states.
 * Unknown account addresses are served as an alias of MOCK_CREATORS[0] (created tokens re-attributed),
 * so a freshly connected dev wallet has a profile with tokens and creator fees.
 */
import {
  GRADUATION_ETH,
  INITIAL_CURVE,
  POOL_RESERVE,
  TOTAL_SUPPLY,
  UNISWAP_V4,
  VIRTUAL_TOKEN_0,
  WAD,
  maxBuyForTokens,
  mcapWeiOf,
  priceWeiOf,
  progressBpsOf,
  quoteBuy,
  quoteSell,
  realEthOf,
  soldOf,
  type AccountResponse,
  type Candle,
  type CurveState,
  type DailyPoint,
  type Hex,
  type Holder,
  type Holding,
  type Interval,
  type ProtocolStats,
  type TokenDetail,
  type TokenSummary,
  type TokensQuery,
  type Trade,
} from "@lancio/shared";
import { keccak256, toHex } from "viem";
import { ApiError } from "./api";
import { config } from "./config";
import { emblemSvg, svgDataUri } from "./identicon";

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86_400;
const ZERO = "0x0000000000000000000000000000000000000000";

const addr = (seed: string) => keccak256(toHex(seed)).slice(0, 42) as Hex;
const hash = (seed: string) => keccak256(toHex(seed)) as Hex;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MOCK_CREATORS: Hex[] = Array.from({ length: 12 }, (_, i) => addr(`lancio-mock-creator-${i}`));
export const MOCK_TRADERS: Hex[] = Array.from({ length: 80 }, (_, i) => addr(`lancio-mock-trader-${i}`));
const LAUNCHPAD = (config.deployment.launchpad !== ZERO ? config.deployment.launchpad : addr("lancio-mock-launchpad")).toLowerCase() as Hex;
const POOL_MANAGER = UNISWAP_V4.poolManager.toLowerCase() as Hex;

const FIRST = ["Gilded", "Arsenale", "Doge", "Rialto", "Lagoon", "Galley", "Ducat", "Murano", "Lion", "Carnival", "Mint", "Forge", "Candle", "Harbor", "Ochre", "Saffron", "Silk", "Compass", "Anchor", "Sail", "Tide", "Lantern", "Mosaic"];
const SECOND = ["Cat", "Frog", "Owl", "Coin", "Mask", "Key", "Gate", "Bell", "Moon", "Sun", "Eye", "Ship", "Crown", "Hound", "Fox", "Goose", "Crab", "Oar", "Gull", "Bear"];
const DESCRIPTIONS = [
  "A token for everyone who watched the galleys leave the Arsenale.",
  "Minted on the same curve as every other. No allocations, no shortcuts.",
  "The community keeps the lantern lit. Liquidity locks when the curve closes.",
  "Named after the harbour cat that never missed a launch.",
  null,
  "One supply, one curve. The rest is up to the crowd at the gate.",
];

type TokenRec = { summary: TokenDetail; trades: Trade[] /* ascending */; balances: Map<Hex, bigint>; poolTokens: bigint; startPrice: bigint };

type Db = { tokens: TokenRec[]; byAddr: Map<string, TokenRec>; allTrades: Trade[] /* desc */ };

let DB: Db | null = null;

function build(): Db {
  const rnd = mulberry32(4663);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const ethWei = (eth: number) => BigInt(Math.max(1, Math.round(eth * 1e6))) * 10n ** 12n;

  const tokens: TokenRec[] = [];
  const N_GRAD = 5;
  const N = 65;

  for (let i = 0; i < N; i++) {
    const graduated = i < N_GRAD;
    const address = addr(`lancio-mock-token-${i}`);
    const f = FIRST[(i * 7) % FIRST.length];
    const s = SECOND[(i * 3 + Math.floor(i / FIRST.length)) % SECOND.length];
    const name = i % 9 === 4 ? `${f.toLowerCase()} ${s.toLowerCase()}` : `${f} ${s}`;
    const symbol = (f.slice(0, 3) + s).toUpperCase().slice(0, 10);
    const creator = MOCK_CREATORS[i % MOCK_CREATORS.length];

    const createdAt = graduated
      ? NOW - Math.floor(between(6, 28) * DAY)
      : i % 10 === 5
        ? NOW - Math.floor(between(20, 600))
        : NOW - Math.floor(between(0.05, 25) * DAY);
    const createdBlock = 60_000_000 + (createdAt - (NOW - 30 * DAY)) * 10;
    // Target progress: mostly early, some mid, a few close to graduation.
    const r = rnd();
    const target = graduated ? 1 : r < 0.5 ? between(0.002, 0.2) : r < 0.85 ? between(0.2, 0.7) : between(0.7, 0.985);
    const targetReal = BigInt(Math.floor(target * 1e6)) * (GRADUATION_ETH / 1_000_000n);

    const recentActivity = rnd() < 0.35;
    const lastTs = recentActivity || i % 10 === 5 ? NOW - Math.floor(between(1, 90)) : Math.min(NOW, createdAt + Math.floor((NOW - createdAt) * between(0.3, 1)));
    const nTrades = graduated ? 70 : Math.max(2, Math.round(between(4, 55) * Math.max(0.3, target)));

    let st: CurveState = { ...INITIAL_CURVE };
    const balances = new Map<Hex, bigint>();
    const trades: Trade[] = [];
    let creatorFees = 0n;
    let graduatedAt: number | null = null;
    let poolEth = 0n;
    let poolTok = 0n;
    const add = (who: Hex, d: bigint) => balances.set(who, (balances.get(who) ?? 0n) + d);

    const push = (t: Omit<Trade, "id" | "txHash" | "blockNumber" | "token" | "symbol">) => {
      const txHash = hash(`lancio-mock-tx-${i}-${trades.length}`);
      trades.push({ ...t, id: `${txHash}-${trades.length % 7}`, txHash, blockNumber: createdBlock + (t.timestamp - createdAt) * 10, token: address, symbol });
    };

    const times = Array.from({ length: nTrades }, (_, k) => (k === 0 ? createdAt : createdAt + Math.floor(rnd() * Math.max(1, lastTs - createdAt)))).sort((a, b) => a - b);
    if (nTrades > 1) times[times.length - 1] = lastTs;
    const curveEnd = graduated ? Math.floor(nTrades * 0.45) : nTrades;

    for (let k = 0; k < nTrades; k++) {
      const ts = times[k];
      if (k < curveEnd || !graduatedAt) {
        // ---- curve phase
        const forcing = graduated && k >= curveEnd - 1; // last curve trade of a graduated token completes the curve
        const devBuy = k === 0 && rnd() < 0.6;
        const holders = [...balances.entries()].filter(([, b]) => b > 0n);
        const sell = !forcing && !devBuy && k > 1 && holders.length > 0 && rnd() < 0.22;
        if (sell) {
          const [who, bal] = pick(holders);
          const amt = (bal * BigInt(Math.floor(between(20, 100)))) / 100n;
          if (amt === 0n || amt > soldOf(st)) continue;
          const q = quoteSell(st, amt);
          st = q.next;
          add(who, -amt);
          creatorFees += q.creatorFee;
          push({ trader: who, side: "sell", ethAmount: q.grossOut.toString(), tokenAmount: amt.toString(), feeEth: q.fee.toString(), priceEth: priceWeiOf(st).toString(), timestamp: ts, source: "curve" });
          continue;
        }
        const who = devBuy ? creator : pick(MOCK_TRADERS);
        const remaining = graduated ? GRADUATION_ETH * 2n : targetReal - realEthOf(st);
        if (remaining <= 0n) continue;
        const left = BigInt(Math.max(1, curveEnd - k));
        let ethIn = (remaining * BigInt(Math.floor(between(60, 200)))) / 100n / left;
        if (forcing) ethIn = GRADUATION_ETH * 2n;
        if (devBuy) ethIn = BigInt(Math.floor(between(0.05, 1) * 1e6)) * (maxBuyForTokens(st) / 1_000_000n);
        if (ethIn < ethWei(0.001)) ethIn = ethWei(0.001);
        let q = quoteBuy(st, ethIn);
        if (q.graduates && !graduated) {
          ethIn = remaining > 0n ? remaining : ethWei(0.001);
          q = quoteBuy(st, ethIn);
          if (q.graduates) continue;
        }
        st = q.next;
        add(who, q.tokensOut);
        creatorFees += q.creatorFee;
        push({ trader: who, side: "buy", ethAmount: q.ethUsed.toString(), tokenAmount: q.tokensOut.toString(), feeEth: q.fee.toString(), priceEth: priceWeiOf(st).toString(), timestamp: ts, source: "curve" });
        if (q.graduates) {
          graduatedAt = ts;
          poolEth = GRADUATION_ETH;
          poolTok = POOL_RESERVE;
        }
      } else {
        // ---- pool phase (1% fee, constant product on the locked full-range position)
        const buy = rnd() < 0.68;
        const who = pick(MOCK_TRADERS);
        if (buy) {
          const ethIn = ethWei(between(0.05, 2.2));
          const fee = ethIn / 100n;
          const net = ethIn - fee;
          const out = poolTok - (poolEth * poolTok) / (poolEth + net);
          poolEth += net;
          poolTok -= out;
          add(who, out);
          creatorFees += fee / 2n;
          push({ trader: who, side: "buy", ethAmount: ethIn.toString(), tokenAmount: out.toString(), feeEth: fee.toString(), priceEth: ((poolEth * WAD) / poolTok).toString(), timestamp: ts, source: "pool" });
        } else {
          const bal = balances.get(who) ?? 0n;
          const amt = bal > 0n ? bal / 2n : 0n;
          if (amt === 0n) continue;
          const gross = poolEth - (poolEth * poolTok) / (poolTok + amt);
          const fee = gross / 100n;
          poolEth -= gross;
          poolTok += amt;
          add(who, -amt);
          creatorFees += fee / 2n;
          push({ trader: who, side: "sell", ethAmount: gross.toString(), tokenAmount: amt.toString(), feeEth: fee.toString(), priceEth: ((poolEth * WAD) / poolTok).toString(), timestamp: ts, source: "pool" });
        }
      }
    }

    const isGrad = graduatedAt !== null;
    const price = isGrad ? (poolEth * WAD) / poolTok : priceWeiOf(st);
    const mcap = isGrad ? (price * TOTAL_SUPPLY) / WAD : mcapWeiOf(st);
    const startPrice = priceWeiOf(INITIAL_CURVE);
    const vol = (since: number) => trades.filter((t) => t.timestamp >= since).reduce((a, t) => a + BigInt(t.ethAmount), 0n);
    const before24 = [...trades].reverse().find((t) => t.timestamp < NOW - DAY);
    const p24 = before24 ? BigInt(before24.priceEth) : createdAt < NOW - DAY ? price : startPrice;
    const change24hPct = trades.length ? (Number(price - p24) / Number(p24)) * 100 : null;
    const lastBuy = [...trades].reverse().find((t) => t.side === "buy");
    const holdersCount = [...balances.values()].filter((b) => b > 0n).length;
    const hasMeta = i % 7 !== 3;

    const summary: TokenDetail = {
      address,
      name,
      symbol,
      creator,
      createdAt,
      createdBlock,
      status: isGrad ? "graduated" : "curve",
      metadataUri: `ipfs://bafymock${i}`,
      meta: {
        description: pick(DESCRIPTIONS),
        image: hasMeta ? svgDataUri(emblemSvg(address)) : null,
        x: i % 3 === 0 ? `https://x.com/${symbol.toLowerCase()}` : null,
        telegram: i % 4 === 0 ? `https://t.me/${symbol.toLowerCase()}` : null,
        website: i % 5 === 0 ? `https://${symbol.toLowerCase()}.example` : null,
      },
      vEth: st.vEth.toString(),
      vTok: st.vTok.toString(),
      realEth: realEthOf(st).toString(),
      progressBps: isGrad ? 10_000 : Math.min(9_999, progressBpsOf(st)),
      priceEth: price.toString(),
      mcapEth: mcap.toString(),
      volumeEth24h: vol(NOW - DAY).toString(),
      volumeEth7d: vol(NOW - 7 * DAY).toString(),
      volumeEthAll: vol(0).toString(),
      change24hPct,
      tradesCount: trades.length,
      holdersCount: holdersCount + 1,
      lastBuyAt: lastBuy?.timestamp ?? null,
      lastTradeAt: trades.at(-1)?.timestamp ?? null,
      graduatedAt,
      poolId: isGrad ? hash(`lancio-mock-pool-${i}`) : null,
      creatorFeesAccruedEth: creatorFees.toString(),
      creatorFeesClaimedEth: ((creatorFees * BigInt(i % 3)) / 4n).toString(),
    };
    tokens.push({ summary, trades, balances, poolTokens: poolTok, startPrice });
  }

  const byAddr = new Map(tokens.map((t) => [t.summary.address, t]));
  const allTrades = tokens.flatMap((t) => t.trades).sort((a, b) => b.timestamp - a.timestamp);
  return { tokens, byAddr, allTrades };
}

const db = () => (DB ??= build());

/* ------------------------------------------------------------------ helpers */

const isEmpty = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mock") === "empty";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (d: TokenDetail): TokenSummary => {
  const s: Partial<TokenDetail> = { ...d };
  delete s.creatorFeesAccruedEth;
  delete s.creatorFeesClaimedEth;
  return s as TokenSummary;
};
const utcDay = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

function tokenOr404(a: string) {
  const t = db().byAddr.get(a.toLowerCase() as Hex);
  if (!t || isEmpty()) throw new ApiError(404, `token ${a} not found`);
  return t;
}

function listTokens(q: TokensQuery) {
  const pageSize = Math.min(100, Number(q.pageSize ?? 25));
  const page = Math.max(1, Number(q.page ?? 1));
  if (isEmpty()) return { items: [], total: 0, page, pageSize };
  let items = db().tokens.map((t) => t.summary);
  if (q.status && q.status !== "all") items = items.filter((t) => t.status === q.status);
  if (q.q) {
    const s = q.q.toLowerCase();
    items = items.filter((t) => t.name.toLowerCase().includes(s) || t.symbol.toLowerCase().includes(s) || t.address.startsWith(s));
  }
  const volKey = q.window === "24h" ? "volumeEth24h" : q.window === "7d" ? "volumeEth7d" : "volumeEthAll";
  const big = (v: string) => BigInt(v);
  const cmp = (a: bigint, b: bigint) => (a > b ? -1 : a < b ? 1 : 0);
  switch (q.sort ?? "recentBuys") {
    case "recentBuys":
      items.sort((a, b) => (b.lastBuyAt ?? 0) - (a.lastBuyAt ?? 0));
      break;
    case "newest":
      items.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "oldest":
      items.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case "marketCap":
      items.sort((a, b) => cmp(big(a.mcapEth), big(b.mcapEth)));
      break;
    case "volume":
      items.sort((a, b) => cmp(big(a[volKey]), big(b[volKey])));
      break;
  }
  return { items: items.slice((page - 1) * pageSize, page * pageSize).map(strip), total: items.length, page, pageSize };
}

const BUCKET: Record<Interval, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };

function candles(a: string, interval: Interval): Candle[] {
  const t = tokenOr404(a);
  const size = BUCKET[interval];
  const out: Candle[] = [];
  let prev = t.startPrice;
  for (const tr of t.trades) {
    const time = Math.floor(tr.timestamp / size) * size;
    const p = BigInt(tr.priceEth);
    const last = out.at(-1);
    if (last && last.time === time) {
      if (p > BigInt(last.high)) last.high = p.toString();
      if (p < BigInt(last.low)) last.low = p.toString();
      last.close = p.toString();
      last.volumeEth = (BigInt(last.volumeEth) + BigInt(tr.ethAmount)).toString();
    } else {
      const hi = p > prev ? p : prev;
      const lo = p < prev ? p : prev;
      out.push({ time, open: prev.toString(), high: hi.toString(), low: lo.toString(), close: p.toString(), volumeEth: tr.ethAmount });
    }
    prev = p;
  }
  return out;
}

function holders(a: string, limit: number): Holder[] {
  const t = tokenOr404(a);
  const s = t.summary;
  const rows: Holder[] = [];
  const share = (b: bigint) => Number((b * 10_000n) / TOTAL_SUPPLY);
  if (s.status === "curve") {
    const inLaunchpad = TOTAL_SUPPLY - (VIRTUAL_TOKEN_0 - BigInt(s.vTok));
    rows.push({ account: LAUNCHPAD, balance: inLaunchpad.toString(), shareBps: share(inLaunchpad), label: "curve" });
  } else {
    rows.push({ account: POOL_MANAGER, balance: t.poolTokens.toString(), shareBps: share(t.poolTokens), label: "pool" });
  }
  for (const [acc, bal] of t.balances) {
    if (bal <= 0n) continue;
    rows.push({ account: acc, balance: bal.toString(), shareBps: share(bal), label: acc === s.creator ? "creator" : null });
  }
  return rows.sort((x, y) => (BigInt(y.balance) > BigInt(x.balance) ? 1 : -1)).slice(0, limit);
}

function stats(window: "24h" | "all"): ProtocolStats {
  const { tokens, allTrades } = db();
  const empty = isEmpty();
  const today = Math.floor(NOW / DAY) * DAY;
  const dayStart = today - DAY;
  const inRange = (ts: number, a: number, b: number) => ts >= a && ts < b;
  const sumVol = (a: number, b: number) => allTrades.filter((t) => inRange(t.timestamp, a, b)).reduce((s, t) => s + BigInt(t.ethAmount), 0n);
  const launchesIn = (a: number, b: number) => tokens.filter((t) => inRange(t.summary.createdAt, a, b)).length;
  const pct = (a: bigint | number, b: bigint | number) => (Number(b) === 0 ? null : ((Number(a) - Number(b)) / Number(b)) * 100);
  const curveFees = allTrades.filter((t) => t.source === "curve").reduce((s, t) => s + BigInt(t.feeEth), 0n);
  const poolFees = allTrades.filter((t) => t.source === "pool").reduce((s, t) => s + BigInt(t.feeEth), 0n);
  const graduated = tokens.filter((t) => t.summary.status === "graduated");
  const z = "0";
  const is24 = window === "24h";
  const [a, b] = is24 ? [dayStart, today] : [0, NOW + 1];
  return {
    window,
    updatedAt: NOW,
    latestCompleteDay: utcDay(dayStart),
    volumeEth: empty ? z : sumVol(a, b).toString(),
    volumeChangePct: empty || !is24 ? null : pct(sumVol(dayStart, today), sumVol(dayStart - DAY, dayStart)),
    launches: empty ? 0 : launchesIn(a, b),
    launchesChangePct: empty || !is24 ? null : pct(launchesIn(dayStart, today), launchesIn(dayStart - DAY, dayStart)),
    graduations: empty ? 0 : graduated.filter((t) => inRange(t.summary.graduatedAt ?? 0, a, b)).length,
    uniqueCreators: empty ? 0 : new Set(tokens.map((t) => t.summary.creator)).size,
    fees: empty
      ? { creatorsEth: z, protocolEth: z, curveCreatorsEth: z, curveProtocolEth: z, poolCreatorsEth: z, poolProtocolEth: z, lockedLiquidityEth: z }
      : {
          creatorsEth: ((curveFees * 60n) / 100n + poolFees / 2n).toString(),
          protocolEth: (curveFees - (curveFees * 60n) / 100n + (poolFees - poolFees / 2n)).toString(),
          curveCreatorsEth: ((curveFees * 60n) / 100n).toString(),
          curveProtocolEth: (curveFees - (curveFees * 60n) / 100n).toString(),
          poolCreatorsEth: (poolFees / 2n).toString(),
          poolProtocolEth: (poolFees - poolFees / 2n).toString(),
          lockedLiquidityEth: (GRADUATION_ETH * BigInt(graduated.length)).toString(),
        },
  };
}

function daily(days: number): DailyPoint[] {
  if (isEmpty()) return [];
  const { tokens, allTrades } = db();
  const today = Math.floor(NOW / DAY) * DAY;
  const out: DailyPoint[] = [];
  for (let d = days; d >= 1; d--) {
    const a = today - d * DAY;
    const b = a + DAY;
    out.push({
      day: utcDay(a),
      volumeEth: allTrades.filter((t) => t.timestamp >= a && t.timestamp < b).reduce((s, t) => s + BigInt(t.ethAmount), 0n).toString(),
      launches: tokens.filter((t) => t.summary.createdAt >= a && t.summary.createdAt < b).length,
      graduations: tokens.filter((t) => (t.summary.graduatedAt ?? 0) >= a && (t.summary.graduatedAt ?? 0) < b).length,
    });
  }
  return out;
}

/** Known mock account, or an alias of MOCK_CREATORS[0] for any other address. */
function resolveAccount(a: string): { real: Hex; asked: Hex } {
  const asked = a.toLowerCase() as Hex;
  const known = MOCK_CREATORS.includes(asked) || MOCK_TRADERS.includes(asked);
  return { real: known ? asked : MOCK_CREATORS[0], asked };
}

function account(a: string): AccountResponse {
  const { real, asked } = resolveAccount(a);
  const created = isEmpty() ? [] : db().tokens.filter((t) => t.summary.creator === real);
  const acc = created.reduce((s, t) => s + BigInt(t.summary.creatorFeesAccruedEth), 0n);
  const cl = created.reduce((s, t) => s + BigInt(t.summary.creatorFeesClaimedEth), 0n);
  return {
    address: asked,
    created: created.map((t) => ({ ...strip(t.summary), creator: asked })),
    creatorFeesAccruedEth: acc.toString(),
    creatorFeesClaimedEth: cl.toString(),
    tradesCount: isEmpty() ? 0 : db().allTrades.filter((t) => t.trader === real).length,
  };
}

function holdings(a: string): Holding[] {
  if (isEmpty()) return [];
  const { real } = resolveAccount(a);
  const who = real === MOCK_CREATORS[0] && !MOCK_CREATORS.includes(a.toLowerCase() as Hex) ? MOCK_TRADERS[0] : real;
  return db()
    .tokens.map((t) => ({ token: strip(t.summary), balance: (t.balances.get(who) ?? 0n).toString() }))
    .filter((h) => h.balance !== "0");
}

function tradesPage(list: Trade[], limit: number, before?: string | null) {
  let start = 0;
  if (before) {
    const idx = list.findIndex((t) => t.id === before);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const items = list.slice(start, start + limit);
  const nextCursor = start + limit < list.length ? (items.at(-1)?.id ?? null) : null;
  return { items, nextCursor };
}

/* ------------------------------------------------------------------ router */

type Params = Record<string, string | number | undefined | null>;

export const mockApi = {
  async get<T>(path: string, p: Params): Promise<T> {
    await sleep(120 + Math.random() * 180);
    const num = (k: string, d: number) => (p[k] === undefined || p[k] === null || p[k] === "" ? d : Number(p[k]));
    const str = (k: string) => (p[k] === undefined || p[k] === null ? undefined : String(p[k]));
    let m: RegExpMatchArray | null;
    const r = (x: unknown) => x as T;

    if (path === "/tokens") return r(listTokens(p as TokensQuery));
    if ((m = path.match(/^\/tokens\/(0x[0-9a-f]{40})$/))) return r(tokenOr404(m[1]).summary);
    if ((m = path.match(/^\/tokens\/(0x[0-9a-f]{40})\/candles$/))) return r(candles(m[1], (str("interval") ?? "5m") as Interval));
    if ((m = path.match(/^\/tokens\/(0x[0-9a-f]{40})\/trades$/))) return r(tradesPage([...tokenOr404(m[1]).trades].reverse(), num("limit", 50), str("before")));
    if ((m = path.match(/^\/tokens\/(0x[0-9a-f]{40})\/holders$/))) return r(holders(m[1], num("limit", 20)));
    if (path === "/stats") return r(stats(str("window") === "24h" ? "24h" : "all"));
    if (path === "/stats/daily") return r(daily(num("days", 14)));
    if ((m = path.match(/^\/accounts\/(0x[0-9a-f]{40})$/))) return r(account(m[1]));
    if ((m = path.match(/^\/accounts\/(0x[0-9a-f]{40})\/holdings$/))) return r(holdings(m[1]));
    if ((m = path.match(/^\/accounts\/(0x[0-9a-f]{40})\/trades$/))) {
      const { real } = resolveAccount(m[1]);
      return r(tradesPage(isEmpty() ? [] : db().allTrades.filter((t) => t.trader === real), num("limit", 50), str("before")));
    }
    if (path === "/search") {
      const q = (str("q") ?? "").toLowerCase();
      if (!q || isEmpty()) return r([]);
      return r(
        db()
          .tokens.map((t) => strip(t.summary))
          .filter((t) => t.name.toLowerCase().startsWith(q) || t.symbol.toLowerCase().startsWith(q) || t.address.startsWith(q))
          .slice(0, 10),
      );
    }
    if (path === "/top") {
      if (isEmpty()) return r([]);
      return r(
        db()
          .tokens.map((t) => strip(t.summary))
          .sort((a, b) => (BigInt(b.mcapEth) > BigInt(a.mcapEth) ? 1 : -1))
          .slice(0, num("limit", 10)),
      );
    }
    if (path === "/eth-usd") return r({ usd: 3150.42, updatedAt: NOW });
    throw new ApiError(404, `mock: no route for ${path}`);
  },
};

/** Direct fixture access for component previews. */
export const mockTokens = (): TokenDetail[] => db().tokens.map((t) => t.summary);
export const MOCK_NOW = NOW;
