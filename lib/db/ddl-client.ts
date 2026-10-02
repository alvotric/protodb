import { Pool, type PoolClient, type QueryResultRow } from "pg";

let ddlPool: Pool | null = null;

export function isDdlDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_DDL_URL);
}

/**
 * Separate privileged connection used only for explicitly authorized DDL.
 * The browser never sees this credential. Keep DATABASE_URL on the
 * least-privileged runtime role and use DATABASE_DDL_URL only for
 * Owner/Admin-approved schema changes.
 */
export function getDdlPool(): Pool {
  if (!process.env.DATABASE_DDL_URL) {
    throw new Error(
      "DATABASE_DDL_URL is not configured. Schema changes are disabled until a separate server-side DDL connection is configured."
    );
  }

  if (!ddlPool) {
    ddlPool = new Pool({
      connectionString: process.env.DATABASE_DDL_URL,
      ssl: process.env.DATABASE_DDL_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
    ddlPool.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL DDL client:", err);
    });
  }

  return ddlPool;
}

export async function ddlQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  return (await getDdlPool().query<T>(text, params)).rows;
}

export async function withDdlTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDdlPool().connect();
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
        throw new AggregateError([error, rollbackError], "DDL operation and rollback both failed.");
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
