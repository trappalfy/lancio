import path from "node:path";
import { drizzle, type PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import postgres from "postgres";
import { DDL, schema } from "./schema";

/**
 * Forum database. DATABASE_URL set → Postgres via postgres-js; otherwise PGlite persisted at web/.pglite.
 * Both go through drizzle's pg-proxy driver, so there is one query path and one DB type.
 * PGlite is imported at runtime (not bundled): its WASM/data files must load from node_modules.
 */
export type DB = PgRemoteDatabase<typeof schema>;

type RawClient = {
  query: (sql: string, params: unknown[], method: "all" | "execute") => Promise<{ rows: unknown[] }>;
  exec: (sql: string) => Promise<void>;
};

async function connect(): Promise<RawClient> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = postgres(url, { max: 5, onnotice: () => {} });
    return {
      query: async (q, params, method) => {
        const pending = sql.unsafe(q, params as never[]);
        return { rows: method === "all" ? await pending.values() : await pending };
      },
      exec: async (q) => {
        await sql.unsafe(q);
      },
    };
  }
  const { PGlite } = await import(/* webpackIgnore: true */ "@electric-sql/pglite");
  const pg = await PGlite.create(path.join(process.cwd(), ".pglite"));
  return {
    query: async (q, params, method) => {
      const res = await pg.query(q, params, { rowMode: method === "all" ? "array" : "object" });
      return { rows: res.rows };
    },
    exec: async (q) => {
      await pg.exec(q);
    },
  };
}

async function init(): Promise<DB> {
  const raw = await connect();
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
