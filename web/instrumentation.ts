/**
 * Runs once per server instance. Hands lib/api.ts the built-in indexer for server-side calls (server components,
 * route handlers), so they query the database directly instead of fetching the site's own /api over HTTP.
 * Registered here rather than imported by lib/api.ts, which also ships to the browser.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ixGet } = await import("./indexer/server");
  (globalThis as { __lancioIndexer?: unknown }).__lancioIndexer = { get: ixGet };
}
