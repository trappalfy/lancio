/**
 * Sync-on-read: API requests call `maybeSync()` after responding (next/server `after`). A sync pulls Lancio's logs
 * since the last indexed block, applies them and advances the cursor in one transaction. Nothing runs while nobody
 * is on the site; the first visitor after a pause triggers a catch-up.
 *
 * Concurrency: a lease row stops parallel instances from fetching the same range, and the cursor update is
 * conditional (`WHERE cursor = <from - 1>`), so a range is applied exactly once even if a lease expires mid-sync.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { hexToNumber, parseEventLogs, toEventSelector, type RpcLog } from "viem";
import { ABIS, Batch, swapEvent, transferEvent, type Ev } from "./apply";
import { ixDb, ixTx, type IxDb } from "./db";
import { fetchMetadata } from "./metadata";
import { getLogs, isLocal, MAX_SPAN, rpc } from "./rpc";
import { pool, syncState, token } from "./schema";
import { chunk, lc, LAUNCHPAD, LOCKER, mapLimit, POOL_MANAGER, ZERO_ADDRESS, type Hex } from "./shared";

/** Minimum time between two syncs. */
const THROTTLE_MS = 2_000;
/** A sync that dies keeps others out for at most this long. */
const LEASE_MS = 30_000;
/** Stop starting new ranges after this long (catch-ups continue on the next request). */
const BUDGET_MS = 20_000;
/** Stay this many blocks (~2 s) behind the head, so a lagging RPC node cannot return a partial range (anvil: none). */
const LAG_BLOCKS = isLocal ? 0 : 20;
/** Metadata fetches per sync, and attempts before giving up on a token's metadata. */
const META_PER_SYNC = 5;
const META_MAX_ATTEMPTS = 5;

const TRANSFER_TOPIC = toEventSelector(transferEvent);
const SWAP_TOPIC = toEventSelector(swapEvent);

const MAIN = eq(syncState.id, "main");

export type SyncStatus = {
  startBlock: number;
  cursor: number;
  head: number;
  behindBlocks: number;
  lastSyncAt: number;
  syncedAt: number;
  lastError: string | null;
};

export async function syncStatus(): Promise<SyncStatus> {
  const db = await ixDb();
  const [s] = await db.select().from(syncState).where(MAIN);
  if (!s) throw new Error("sync_state missing");
  return {
    startBlock: s.startBlock,
    cursor: s.cursor,
    head: s.head,
    behindBlocks: Math.max(0, s.head - s.cursor),
    lastSyncAt: s.lastSyncAt,
    syncedAt: s.syncedAt,
    lastError: s.lastError,
  };
}

/** Error text for the public status: RPC URLs (which may carry an API key) are masked. */
const publicError = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/\bhttps?:\/\/\S+/g, "<rpc>").slice(0, 500);

// Per-instance throttle, so busy instances skip even the lease query between syncs.
let lastLocalAttempt = 0;

/** Runs one sync unless another is running or one ran less than THROTTLE_MS ago (`force` skips the throttle). */
export async function maybeSync({ force = false }: { force?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (!force && now - lastLocalAttempt < THROTTLE_MS) return;
  lastLocalAttempt = now;
  const db = await ixDb();
  const lease = await db
    .update(syncState)
    .set({ leaseUntil: now + LEASE_MS, lastSyncAt: now })
    .where(and(MAIN, lt(syncState.leaseUntil, now), force ? undefined : lt(syncState.lastSyncAt, now - THROTTLE_MS)))
    .returning({ cursor: syncState.cursor });
  if (lease.length === 0) return;

  let error: string | null = null;
  let head: number | undefined;
  try {
    let cursor = lease[0]!.cursor;
    head = Number(await rpc.getBlockNumber()) - LAG_BLOCKS;
    while (cursor < head && Date.now() - now < BUDGET_MS) {
      cursor = await syncRange(db, cursor, Math.min(head, cursor + MAX_SPAN));
    }
    await fetchPendingMetadata(db);
  } catch (err) {
    error = publicError(err);
    console.error("[lancio-indexer] sync failed:", err);
  } finally {
    await db
      .update(syncState)
      .set({ leaseUntil: 0, lastError: error, ...(head !== undefined ? { head } : {}) })
      .where(MAIN);
  }
}

/** Applies (cursor, to] — or a shorter range if the RPC refuses — and returns the new cursor. */
async function syncRange(db: IxDb, cursor: number, to: number): Promise<number> {
  const [tokenRows, poolRows] = await Promise.all([
    db.select({ address: token.address }).from(token),
    db.select({ poolId: pool.poolId }).from(pool),
  ]);
  const known = { tokens: tokenRows.map((r) => r.address), pools: poolRows.map((r) => r.poolId) };

  const from = cursor + 1;
  let end = to;
  let events: Ev[];
  for (;;) {
    try {
      events = await fetchEvents(from, end, known);
      break;
    } catch (err) {
      // Too many logs or too wide a span for this RPC: halve the range. Small ranges fail for real.
      if (end - from < 1_000) throw err;
      end = from + Math.floor((end - from) / 2);
    }
  }

  await ixTx(async (tx) => {
    const batch = new Batch(tx);
    await batch.preload(events);
    for (const ev of events) await batch.apply(ev);
    await batch.flush(tx);
    const moved = await tx
      .update(syncState)
      .set({ cursor: end, syncedAt: Date.now() })
      .where(and(MAIN, eq(syncState.cursor, cursor)))
      .returning({ cursor: syncState.cursor });
    if (moved.length !== 1) throw new Error(`cursor moved by another sync (expected ${cursor})`);
  });
  return end;
}

/** Every Lancio log in [from, to], decoded, with block timestamps (and tx senders for swaps), in chain order. */
async function fetchEvents(from: number, to: number, known: { tokens: Hex[]; pools: Hex[] }): Promise<Ev[]> {
  const core = await getLogs({ address: [LAUNCHPAD, LOCKER].filter((a) => a !== ZERO_ADDRESS) }, from, to);
  const launchpadLogs = parseEventLogs({ abi: ABIS.launchpad, logs: core.filter((l) => lc(l.address) === LAUNCHPAD) });
  const lockerLogs = parseEventLogs({ abi: ABIS.locker, logs: core.filter((l) => lc(l.address) === LOCKER) });

  const tokens = new Set(known.tokens);
  const pools = new Set(known.pools);
  for (const l of launchpadLogs) {
    if (l.eventName === "TokenCreated") tokens.add(lc(l.args.token));
    if (l.eventName === "Graduated") pools.add(lc(l.args.poolId));
  }

  const [transferLogs, swapLogs] = await Promise.all([
    Promise.all(chunk([...tokens], 500).map((address) => getLogs({ address, topics: [TRANSFER_TOPIC] }, from, to))),
    Promise.all(chunk([...pools], 100).map((ids) => getLogs({ address: POOL_MANAGER, topics: [SWAP_TOPIC, ids] }, from, to))),
  ]);
  const transfers = parseEventLogs({ abi: ABIS.token, logs: transferLogs.flat() });
  const swaps = parseEventLogs({ abi: ABIS.pool, logs: swapLogs.flat() });

  const decoded = [...launchpadLogs, ...lockerLogs, ...transfers, ...swaps];
  if (decoded.length === 0) return [];

  // parseEventLogs keeps the raw RPC fields (hex strings), whatever its return type says.
  const raw = (l: object) => l as unknown as RpcLog;
  const blockNums = [...new Set(decoded.map((l) => hexToNumber(raw(l).blockNumber!)))];
  const swapTxs = [...new Set(swaps.map((l) => raw(l).transactionHash!))];
  const [blocks, txs] = await Promise.all([
    mapLimit(blockNums, 4, (n) => rpc.getBlock({ blockNumber: BigInt(n), includeTransactions: false })),
    mapLimit(swapTxs, 4, (hash) => rpc.getTransaction({ hash })),
  ]);
  const tsOf = new Map(blockNums.map((n, i) => [n, Number(blocks[i]!.timestamp)]));
  const fromOf = new Map(swapTxs.map((h, i) => [h, lc(txs[i]!.from)]));

  const events = decoded.map((l) => {
    const r = raw(l);
    const block = hexToNumber(r.blockNumber!);
    return {
      ...l,
      block,
      index: hexToNumber(r.logIndex!),
      ts: tsOf.get(block)!,
      txHash: lc(r.transactionHash!),
      txFrom: fromOf.get(r.transactionHash!) ?? null,
    } as Ev;
  });
  return events.sort((a, b) => a.block - b.block || a.index - b.index);
}

/** Token metadata is fetched outside the sync transaction; transient failures are retried on later syncs. */
async function fetchPendingMetadata(db: IxDb) {
  const pending = await db
    .select({ address: token.address, uri: token.metadataUri, attempts: token.metaAttempts })
    .from(token)
    .where(eq(token.metaPending, true))
    .orderBy(token.metaAttempts, token.createdAt)
    .limit(META_PER_SYNC);
  await Promise.all(
    pending.map(async (p) => {
      const meta = await fetchMetadata(p.uri);
      if (meta) {
        await db
          .update(token)
          .set({ ...meta, metaPending: false })
          .where(eq(token.address, p.address));
      } else {
        await db
          .update(token)
          .set({ metaAttempts: sql`${token.metaAttempts} + 1`, metaPending: p.attempts + 1 < META_MAX_ATTEMPTS })
          .where(eq(token.address, p.address));
      }
    }),
  );
}
