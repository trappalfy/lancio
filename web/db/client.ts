import { drizzle, type PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import { getConn } from "./connection";
import { DDL, schema } from "./schema";

/**
 * Forum database: the shared connection (db/connection.ts — Neon in production, PGlite locally) through drizzle's
 * pg-proxy driver, so there is one query path and one DB type.
 */
export type DB = PgRemoteDatabase<typeof schema>;

async function init(): Promise<DB> {
  const raw = await getConn();
  for (const stmt of DDL) await raw.exec(stmt);
  return drizzle((sql, params, method) => raw.query(sql, params, method), { schema });
}

// Kept on globalThis so dev hot reloads reuse one connection (PGlite allows one instance per data dir).
const g = globalThis as unknown as { __lancioForumDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  g.__lancioForumDb ??= init().catch((err) => {
    g.__lancioForumDb = undefined;
    throw err;
  });
  return g.__lancioForumDb;
}
