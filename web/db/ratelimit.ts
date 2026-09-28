/**
 * Per-address sliding-window limits, in memory (per server process — enough for one Node instance;
 * move to Postgres/Redis if the forum runs on several instances).
 */
const LIMITS = {
  post: { max: 5, windowMs: 3_600_000 },
  comment: { max: 30, windowMs: 3_600_000 },
  vote: { max: 120, windowMs: 3_600_000 },
} as const;

export type LimitKind = keyof typeof LIMITS;

const g = globalThis as unknown as { __lancioForumHits?: Map<string, number[]> };
const hits = (g.__lancioForumHits ??= new Map<string, number[]>());

/** Records one action. Returns seconds to wait when the limit is reached (nothing recorded), else 0. */
export function takeRateLimit(kind: LimitKind, address: string): number {
  const { max, windowMs } = LIMITS[kind];
  const key = `${kind}:${address.toLowerCase()}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
  }
  recent.push(now);
  hits.set(key, recent);
  return 0;
}
