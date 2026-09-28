import { drizzle, type PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import { getConn, type Conn, type Raw } from "@/db/connection";
import { config } from "@/lib/config";
import { DDL, SCHEMA, SCHEMA_VERSION } from "./schema";
import { LAUNCHPAD } from "./shared";

export type IxDb = PgRemoteDatabase;

const wrap = (raw: Raw): IxDb => drizzle((sql, params, method) => raw.query(sql, params, method));

/** Serialises schema setup/reset across instances (transaction-scoped, so it works behind PgBouncer). */
const LOCK_KEY = 0x4c616e63; // "Lanc"

type StateRow = { launchpad: string; version: number; startBlock: number };

async function readState(raw: Raw): Promise<StateRow | null> {
  const { rows } = await raw.query(
    `SELECT launchpad, version, start_block FROM ${SCHEMA}.sync_state WHERE id = 'main'`,
    [],
    "execute",
  );
  const row = rows[0] as { launchpad: string; version: number | string; start_block: number | string } | undefined;
  return row ? { launchpad: row.launchpad, version: Number(row.version), startBlock: Number(row.start_block) } : null;
}

const START_BLOCK = Math.max(0, config.deployment.startBlock);

/** Same deployment and code version (a new local fork gets a new start block, so it resets too). */
const current = (s: StateRow | null) =>
  !!s && s.launchpad === LAUNCHPAD && s.version === SCHEMA_VERSION && s.startBlock === START_BLOCK;

/**
 * Creates the schema on first use; drops and recreates it when the launchpad, the start block or SCHEMA_VERSION changed
 * (the next sync then rebuilds everything from START_BLOCK).
 */
async function ensureSchema(conn: Conn) {
  try {
    if (current(await readState(conn))) return;
  } catch {
    // schema or table missing — create below
  }
  await conn.transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`, [], "execute");
    const { rows } = await tx.query(`SELECT to_regclass('${SCHEMA}.sync_state') AS t`, [], "execute");
    const exists = (rows[0] as { t: string | null } | undefined)?.t != null;
    const state = exists ? await readState(tx) : null;
    if (current(state)) return; // another instance finished first
    if (exists) await tx.exec(`DROP SCHEMA ${SCHEMA} CASCADE`);
    for (const stmt of DDL) await tx.exec(stmt);
    await tx.query(
      `INSERT INTO ${SCHEMA}.sync_state (id, launchpad, version, start_block, cursor) VALUES ('main', $1, $2, $3, $4)`,
      [LAUNCHPAD, SCHEMA_VERSION, START_BLOCK, Math.max(0, START_BLOCK - 1)],
      "execute",
    );
  });
}

const g = globalThis as unknown as { __lancioIxReady?: Promise<void> };

async function ready(): Promise<Conn> {
  const conn = await getConn();
  g.__lancioIxReady ??= ensureSchema(conn).catch((err) => {
    g.__lancioIxReady = undefined;
    throw err;
  });
  await g.__lancioIxReady;
  return conn;
}

/** Indexer database (read side and non-transactional writes). */
export async function ixDb(): Promise<IxDb> {
  return wrap(await ready());
}

/** Runs `fn` in one transaction. */
export async function ixTx<T>(fn: (db: IxDb) => Promise<T>): Promise<T> {
  const conn = await ready();
  return conn.transaction((raw) => fn(wrap(raw)));
}
