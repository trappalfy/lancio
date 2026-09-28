import { robinhood, type Hex } from "@lancio/shared";
import { tokenAbi } from "@lancio/shared/abi";
import { createPublicClient, defineChain, http } from "viem";
import { api, ApiError } from "@/lib/api";
import { config } from "@/lib/config";
import type { CommentRow, PostRow } from "./forum";
import type { ForumComment, ForumPost, ForumToken } from "./types";

/** Server-side chain reads (SIWE smart-wallet checks, holder badges). Short timeout: badges are best-effort. */
export const chainClient = createPublicClient({
  chain: defineChain({ ...robinhood, id: config.chainId, rpcUrls: { default: { http: [config.rpcUrl] } } }),
  transport: http(config.rpcUrl, { timeout: 4_000, retryCount: 0 }),
});

type Cached<T> = { value: T; until: number };
const TOKEN_TTL = 60_000;
const HOLDER_TTL = 30_000;
const tokenCache = new Map<string, Cached<ForumToken | null>>();
const holderCache = new Map<string, Cached<boolean>>();

function cached<T>(map: Map<string, Cached<T>>, key: string): T | undefined {
  const hit = map.get(key);
  return hit && hit.until > Date.now() ? hit.value : undefined;
}

/** Token symbol/name/image from the indexer (mocks included). 404 → null; indexer errors → null, not cached. */
export async function tokenInfo(address: string): Promise<ForumToken | null> {
  const key = address.toLowerCase();
  const hit = cached(tokenCache, key);
  if (hit !== undefined) return hit;
  try {
    const t = await api.token(key);
    const value: ForumToken = { address: t.address, symbol: t.symbol, name: t.name, image: t.meta.image };
    tokenCache.set(key, { value, until: Date.now() + TOKEN_TTL });
    return value;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) tokenCache.set(key, { value: null, until: Date.now() + TOKEN_TTL });
    return null;
  }
}

/** Set of `${token}:${account}` pairs (lowercase) with a non-zero token balance. Failures count as "not a holder". */
async function holderPairs(pairs: { token: string; account: string }[]): Promise<Set<string>> {
  const out = new Set<string>();
  const todo: { token: string; account: string; key: string }[] = [];
  for (const p of pairs) {
    const key = `${p.token}:${p.account}`;
    const hit = cached(holderCache, key);
    if (hit === undefined) todo.push({ ...p, key });
    else if (hit) out.add(key);
  }
  const unique = [...new Map(todo.map((t) => [t.key, t])).values()];
  if (!unique.length) return out;

  const results = new Map<string, boolean>();
  if (config.useMocks) {
    // Mock tokens are not on chain: read the mock holder lists instead.
    const tokens = [...new Set(unique.map((u) => u.token))];
    const lists = await Promise.all(tokens.map((t) => api.holders(t, 100).catch(() => [])));
    const held = new Set(lists.flatMap((list, i) => list.map((h) => `${tokens[i]}:${h.account.toLowerCase()}`)));
    for (const u of unique) results.set(u.key, held.has(u.key));
  } else {
    try {
      const res = await chainClient.multicall({
        allowFailure: true,
        contracts: unique.map((u) => ({
          address: u.token as Hex,
          abi: tokenAbi,
          functionName: "balanceOf" as const,
          args: [u.account as Hex] as const,
        })),
      });
      unique.forEach((u, i) => {
        const r = res[i];
        results.set(u.key, r.status === "success" && (r.result as bigint) > 0n);
      });
    } catch {
      return out; // RPC unreachable: no badges this time, nothing cached
    }
  }
  const until = Date.now() + HOLDER_TTL;
  for (const [key, held] of results) {
    holderCache.set(key, { value: held, until });
    if (held) out.add(key);
  }
  return out;
}

const hex = (s: string) => s as Hex;

export async function enrichPosts(rows: PostRow[], isAdmin: boolean): Promise<ForumPost[]> {
  const tokens = [...new Set(rows.map((r) => r.token))];
  const [infos, holders] = await Promise.all([
    Promise.all(tokens.map((t) => tokenInfo(t))),
    holderPairs(rows.map((r) => ({ token: r.token, account: r.author }))),
  ]);
  const byToken = new Map(tokens.map((t, i) => [t, infos[i]]));
  return rows.map((r) => ({
    id: r.id,
    token: hex(r.token),
    tokenInfo: byToken.get(r.token) ?? null,
    author: hex(r.author),
    authorIsHolder: holders.has(`${r.token}:${r.author}`),
    title: r.title,
    body: r.body,
    createdAt: r.createdAt,
    score: r.score,
    commentsCount: r.commentsCount,
    myVote: r.myVote,
    hidden: isAdmin ? r.hidden : false,
  }));
}

export async function enrichComments(token: string, rows: CommentRow[]): Promise<ForumComment[]> {
  const holders = await holderPairs(rows.map((r) => ({ token, account: r.author })));
  return rows.map((r) => ({
    id: r.id,
    postId: r.postId,
    author: hex(r.author),
    authorIsHolder: holders.has(`${token}:${r.author}`),
    body: r.body,
    createdAt: r.createdAt,
    hidden: r.hidden,
  }));
}
