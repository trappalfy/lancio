/**
 * Chain access for the built-in indexer. Only Lancio's own logs are requested (launchpad, locker, Lancio tokens,
 * swaps in graduated Lancio pools), so a free RPC is enough.
 *
 * Endpoints: the public Robinhood Chain RPC first, then INDEXER_RPC_URL (optional, e.g. an Alchemy key without a
 * domain allowlist) as a fallback. Locally (NEXT_PUBLIC_RPC_URL on localhost) only the anvil fork is used.
 * NEXT_PUBLIC_RPC_URL is otherwise ignored here: it is meant for browsers and may be origin-restricted.
 */
import { robinhood } from "@lancio/shared";
import { createPublicClient, fallback, http, numberToHex, type Hex, type RpcLog } from "viem";
import { config } from "@/lib/config";

export const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.rpcUrl);

const urls = isLocal
  ? [config.rpcUrl]
  : [...new Set([robinhood.rpcUrls.default.http[0], process.env.INDEXER_RPC_URL].filter((u): u is string => !!u))];

export const rpc = createPublicClient({
  // viem caches eth_blockNumber for 4 s by default; every sync needs the live head.
  cacheTime: 0,
  transport: fallback(urls.map((u) => http(u, { timeout: 10_000, retryCount: 2, batch: { batchSize: 10 } }))),
});

/** Public RPC limit for eth_getLogs with several addresses or topic values ("query spans N blocks"). */
export const MAX_SPAN = 100_000;

export type LogFilter = { address: Hex | Hex[]; topics?: (Hex | Hex[] | null)[] };

/** Raw eth_getLogs (hex fields; no blockTimestamp — the public RPC reports 0x0 there). */
export async function getLogs(filter: LogFilter, fromBlock: number, toBlock: number): Promise<RpcLog[]> {
  return (await rpc.request({
    method: "eth_getLogs",
    params: [{ ...filter, fromBlock: numberToHex(fromBlock), toBlock: numberToHex(toBlock) }],
  })) as RpcLog[];
}
