/** Simple in-memory fixed-window rate limit per IP (per server instance). */
const WINDOW_MS = 10 * 60_000;
const hits = new Map<string, { n: number; reset: number }>();

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Counts this request; true when `key` went over `max` requests in the current window. */
export function rateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset <= now) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  h.n += 1;
  return h.n > max;
}

export const jsonError = (error: string, status: number) => Response.json({ error }, { status });
