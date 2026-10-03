import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { queryOne } from "@/lib/db/client";
import {
  createDatabasePoolConfig,
  DatabaseConfigurationError,
  DdlTargetMismatchError,
  parseDatabaseTarget,
  targetsMatch,
} from "@/lib/db/connection-config";

const globalForPostgres = globalThis as typeof globalThis & { __protoDbDdlPool?: Pool };

export function isDdlDatabaseConfigured(): boolean {
  if (!process.env.DATABASE_DDL_URL || !process.env.DATABASE_URL) return false;
  try {
    const main = createDatabasePoolConfig(
      "DATABASE_URL", "DATABASE_SSL", "DATABASE_SSL_CA", "DATABASE_SSL_ALLOW_SELF_SIGNED"
    );
    const ddl = createDatabasePoolConfig(
      "DATABASE_DDL_URL", "DATABASE_DDL_SSL", "DATABASE_DDL_SSL_CA", "DATABASE_DDL_SSL_ALLOW_SELF_SIGNED"
    );
    return targetsMatch(
      parseDatabaseTarget(main.connectionString!),
      parseDatabaseTarget(ddl.connectionString!)
    );
  } catch {
    return false;
  }
}

/**
 * Separate privileged connection used only for explicitly authorized DDL.
 * The browser never sees this credential. Keep DATABASE_URL on the
 * least-privileged runtime role and use DATABASE_DDL_URL only for
 * Owner/Admin-approved schema changes.
 */
export function getDdlPool(): Pool {
  if (!isDdlDatabaseConfigured()) {
    throw new Error(
      "DDL database configuration is unavailable or does not match DATABASE_URL. Schema changes are disabled."
    );
  }

  if (!globalForPostgres.__protoDbDdlPool) {
    globalForPostgres.__protoDbDdlPool = new Pool({
      ...createDatabasePoolConfig(
        "DATABASE_DDL_URL",
        "DATABASE_DDL_SSL",
        "DATABASE_DDL_SSL_CA",
        "DATABASE_DDL_SSL_ALLOW_SELF_SIGNED"
      ),
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
    globalForPostgres.__protoDbDdlPool.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL DDL client:", err);
    });
  }

  return globalForPostgres.__protoDbDdlPool;
}

async function assertSameDatabaseTarget(client: PoolClient): Promise<void> {
  try {
    const main = createDatabasePoolConfig(
      "DATABASE_URL", "DATABASE_SSL", "DATABASE_SSL_CA", "DATABASE_SSL_ALLOW_SELF_SIGNED"
    );
    const ddl = createDatabasePoolConfig(
      "DATABASE_DDL_URL", "DATABASE_DDL_SSL", "DATABASE_DDL_SSL_CA", "DATABASE_DDL_SSL_ALLOW_SELF_SIGNED"
    );
    if (!targetsMatch(parseDatabaseTarget(main.connectionString!), parseDatabaseTarget(ddl.connectionString!))) {
      throw new DdlTargetMismatchError();
    }
    const [mainIdentity, ddlIdentityResult] = await Promise.all([
      queryOne<{ database_name: string; server_address: string | null; server_port: number }>(
        `select current_database() as database_name, inet_server_addr()::text as server_address, inet_server_port() as server_port`
      ),
      client.query<{ database_name: string; server_address: string | null; server_port: number }>(
        `select current_database() as database_name, inet_server_addr()::text as server_address, inet_server_port() as server_port`
      ),
    ]);
    const ddlIdentity = ddlIdentityResult.rows[0];
    if (
      !mainIdentity ||
      !ddlIdentity ||
      !mainIdentity.server_address ||
      !ddlIdentity.server_address ||
      mainIdentity.database_name !== ddlIdentity.database_name ||
      mainIdentity.server_address !== ddlIdentity.server_address ||
      mainIdentity.server_port !== ddlIdentity.server_port
    ) {
      throw new DdlTargetMismatchError();
    }
  } catch (error) {
    if (error instanceof DdlTargetMismatchError) throw error;
    if (error instanceof DatabaseConfigurationError) throw new DdlTargetMismatchError();
    throw new DdlTargetMismatchError();
  }
}

export async function ddlQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getDdlPool().connect();
  try {
    await assertSameDatabaseTarget(client);
    return (await client.query<T>(text, params)).rows;
  } finally {
    client.release();
  }
}

export async function withDdlTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDdlPool().connect();
  let transactionStarted = false;
  try {
    await assertSameDatabaseTarget(client);
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
        throw new AggregateError([error, rollbackError], "DDL operation and rollback both failed.");
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
