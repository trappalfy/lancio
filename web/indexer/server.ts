/**
 * Entry points of the built-in indexer (used when NEXT_PUBLIC_INDEXER_URL is empty):
 *  - `handle` serves /api/{tokens,stats,accounts,search,top} and schedules a sync after the response;
 *  - `ixGet` answers the same routes in-process for server components and route handlers (lib/api.ts calls it
 *    through a global set in instrumentation.ts, so client bundles never import this module).
 */
import { after } from "next/server";
import { ApiError } from "@/lib/api";
import { config } from "@/lib/config";
import app from "./api";
import { maybeSync } from "./sync";

const enabled = () => !config.useMocks && !config.prelaunch && !config.indexerUrl;

/** CDN keeps each response 1 s (then serves it stale up to 4 s while refreshing), so polling visitors share it. */
const CACHE = "public, max-age=0, s-maxage=1, stale-while-revalidate=4";

export async function handle(req: Request): Promise<Response> {
  if (!enabled()) return Response.json({ error: "not_configured" }, { status: 404 });
  const res = await app.fetch(req);
  after(() => maybeSync().catch((err) => console.error("[lancio-indexer] sync:", err)));
  const headers = new Headers(res.headers);
  headers.set("cache-control", res.ok ? CACHE : "no-store");
  return new Response(res.body, { status: res.status, headers });
}

export async function ixGet<T>(path: string, params: Record<string, string | number | undefined | null>): Promise<T> {
  const url = new URL(`/api${path}`, "http://lancio.internal");
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const res = await app.fetch(new Request(url));
  if (!res.ok) throw new ApiError(res.status, `${res.status} — ${path}`);
  return (await res.json()) as T;
}
