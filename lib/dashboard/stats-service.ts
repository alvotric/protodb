import { queryOne } from "@/lib/db/client";
import { query } from "@/lib/db/client";

export interface DashboardStats {
  cacheHitRatioPct: number | null;
  activeConnections: number;
  maxConnections: number;
  databaseSizeBytes: number | null;
  tableCount: number | null;
}

export interface DashboardActivity {
  id: string;
  actor: string;
  action: string;
  resource: string;
  result: "success" | "failed";
  at: string;
}

export type DatabaseConnectionSnapshot = {
  activeConnections: number;
  maxConnections: number;
};

function parseSafeNonNegativeInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function getDatabaseConnectionSnapshot(): Promise<DatabaseConnectionSnapshot> {
  const [connRow, maxConnRow] = await Promise.all([
    queryOne<{ count: string }>(`select count(*)::text as count from pg_stat_activity where datname = current_database()`),
    queryOne<{ max_connections: string }>(`select setting as max_connections from pg_settings where name = 'max_connections'`),
  ]);
  if (!connRow || !maxConnRow || !/^\d+$/.test(connRow.count) || !/^\d+$/.test(maxConnRow.max_connections)) {
    throw new Error("PostgreSQL did not return valid connection metrics.");
  }
  const activeConnections = Number(connRow.count);
  const maxConnections = Number(maxConnRow.max_connections);
  if (!Number.isSafeInteger(activeConnections) || !Number.isSafeInteger(maxConnections) || maxConnections < 1) {
    throw new Error("PostgreSQL returned out-of-range connection metrics.");
  }
  return { activeConnections, maxConnections };
}

/**
 * Phase 10 — Backend API & Real Data Integration.
 * Real PostgreSQL system catalog queries -- see
 * app/api/dashboard/stats/route.ts's own doc comment for why
 * `cacheHitRatioPct` (a genuine buffer cache hit ratio) replaces the
 * mock Dashboard's invented "98.7% Excellent", and why there's no
 * average-query-time figure here (pg_stat_statements needs a server
 * config change this app can't make from inside a session).
 *
 * Called two ways: directly from app/dashboard/page.tsx (a Server
 * Component -- no reason to round-trip through its own API route),
 * and from app/api/dashboard/stats/route.ts for any future
 * client-side refresh. One query implementation, not two.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [cacheRow, connectionSnapshot, sizeRow, tableRow] = await Promise.all([
    queryOne<{ ratio: string | null }>(
      `select case
                when sum(blks_hit) + sum(blks_read) = 0 then null
                else (sum(blks_hit)::float / (sum(blks_hit) + sum(blks_read)) * 100)::text
              end as ratio
       from pg_stat_database where datname = current_database()`
    ),
    getDatabaseConnectionSnapshot(),
    queryOne<{ size_bytes: string }>(`select pg_database_size(current_database())::text as size_bytes`),
    queryOne<{ count: string }>(
      `select count(*)::text as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`
    ),
  ]);

  const ratio = cacheRow?.ratio === null || cacheRow?.ratio === undefined ? null : Number(cacheRow.ratio);
  return {
    cacheHitRatioPct: ratio !== null && Number.isFinite(ratio)
      ? Math.round(ratio * 10) / 10
      : null,
    activeConnections: connectionSnapshot.activeConnections,
    maxConnections: connectionSnapshot.maxConnections,
    databaseSizeBytes: parseSafeNonNegativeInteger(sizeRow?.size_bytes),
    tableCount: parseSafeNonNegativeInteger(tableRow?.count),
  };
}

export async function getRecentDashboardActivity(limit = 5): Promise<DashboardActivity[]> {
  const boundedLimit = Math.min(Math.max(Math.floor(limit) || 5, 1), 10);
  const rows = await query<{
    id: string;
    actor: string;
    action: string;
    resource: string;
    result: DashboardActivity["result"];
    at: Date | string;
  }>(
    `select id::text, actor, action, resource, result, at
     from protodb_admin.audit_log
     order by at desc, id desc
     limit $1`,
    [boundedLimit]
  );
  return rows.map((row) => ({ ...row, at: new Date(row.at).toISOString() }));
}
