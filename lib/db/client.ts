import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { createDatabasePoolConfig } from "@/lib/db/connection-config";

/**
 * Phase 10 — Backend API & Real Data Integration.
 *
 * The one real database connection this app manages. `DATABASE_URL`
 * is supplied by you (the account owner) -- never hardcoded, same
 * pattern as every credential in this codebase's design so far. This
 * pool is used two ways:
 *  1. Administering the target database itself (schema introspection,
 *     table data, SQL Editor execution) -- Phases 2-6's real backing.
 *  2. This app's own bookkeeping, kept in a dedicated `protodb_admin`
 *     schema *within that same database* rather than a second
 *     connection string to manage -- auth users/sessions, audit log,
 *     saved queries, notification preferences. This mirrors how
 *     Supabase itself keeps its `auth`/`storage` schemas alongside
 *     your own tables in one Postgres instance, rather than needing
 *     a separate database for its own metadata.
 *
 * `isDatabaseConfigured()` lets every route degrade gracefully before
 * DATABASE_URL exists -- pages show a real "not connected yet" state
 * instead of crashing, and come alive the moment the env var is set,
 * with no code change (same shape as `isStripeConfigured()` would be
 * in a billing-focused app).
 */
const globalForPostgres = globalThis as typeof globalThis & { __protoDbMainPool?: Pool };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add it to enable real data -- see .env.example. Until then, every page falls back to its own honest 'not connected' state."
    );
  }
  if (!globalForPostgres.__protoDbMainPool) {
    globalForPostgres.__protoDbMainPool = new Pool({
      ...createDatabasePoolConfig(
        "DATABASE_URL",
        "DATABASE_SSL",
        "DATABASE_SSL_CA",
        "DATABASE_SSL_ALLOW_SELF_SIGNED"
      ),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
    globalForPostgres.__protoDbMainPool.on("error", (err) => {
      // A background/idle client failing shouldn't crash the process --
      // the next query on this pool will just open a fresh connection.
      console.error("Unexpected error on idle PostgreSQL client:", err);
    });
  }
  return globalForPostgres.__protoDbMainPool;
}

/** Thin convenience wrapper -- every route handler uses this rather than reaching for the pool directly, so error shape is consistent. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** A single result row, or null -- for the common "look up exactly one thing" case. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let transactionStarted = false;
  try {
    await client.query("begin");
    transactionStarted = true;
    const result = await operation(client);
    await client.query("commit");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Database operation and rollback both failed.");
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
