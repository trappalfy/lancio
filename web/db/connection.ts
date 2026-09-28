import path from "node:path";
import postgres from "postgres";

/**
 * One raw Postgres connection per process, shared by the forum (db/client.ts) and the built-in indexer (indexer/).
 * DATABASE_URL set → postgres-js (Neon in production); otherwise PGlite persisted at web/.pglite, or PGLITE_DIR
 * (one instance per data dir, so both users must share it). Both are wrapped in drizzle's pg-proxy driver by their users.
 * PGlite is imported at runtime (not bundled): its WASM/data files must load from node_modules.
 */
export type Method = "all" | "execute";

export type Raw = {
  query: (sql: string, params: unknown[], method: Method) => Promise<{ rows: unknown[] }>;
  exec: (sql: string) => Promise<void>;
};

/** Raw client + transactions (every statement of `fn` runs on the same connection). */
export type Conn = Raw & { transaction: <T>(fn: (tx: Raw) => Promise<T>) => Promise<T> };

async function connect(): Promise<Conn> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // prepare: false — Neon's pooled endpoint (PgBouncer, transaction mode) does not keep named prepared statements.
    const sql = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
    const rawOf = (s: postgres.Sql | postgres.TransactionSql): Raw => ({
      query: async (q, params, method) => {
        const pending = s.unsafe(q, params as never[]);
        return { rows: method === "all" ? await pending.values() : await pending };
      },
      exec: async (q) => {
        await s.unsafe(q);
      },
    });
    return {
      ...rawOf(sql),
      transaction: async <T,>(fn: (tx: Raw) => Promise<T>) => (await sql.begin((tx) => fn(rawOf(tx)))) as T,
    };
  }
  const { PGlite } = await import(/* webpackIgnore: true */ "@electric-sql/pglite");
  const pg = await PGlite.create(process.env.PGLITE_DIR || path.join(process.cwd(), ".pglite"));
  type Queryable = Pick<typeof pg, "query" | "exec">;
  const rawOf = (p: Queryable): Raw => ({
    query: async (q, params, method) => {
      const res = await p.query(q, params, { rowMode: method === "all" ? "array" : "object" });
      return { rows: res.rows };
    },
    exec: async (q) => {
      await p.exec(q);
    },
  });
  return { ...rawOf(pg), transaction: (fn) => pg.transaction((tx) => fn(rawOf(tx))) };
}

// Kept on globalThis so dev hot reloads reuse one connection (PGlite allows one instance per data dir).
const g = globalThis as unknown as { __lancioConn?: Promise<Conn> };

export function getConn(): Promise<Conn> {
  g.__lancioConn ??= connect().catch((err) => {
    g.__lancioConn = undefined;
    throw err;
  });
  return g.__lancioConn;
}
