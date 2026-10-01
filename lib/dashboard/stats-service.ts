import { queryOne } from "@/lib/db/client";

export interface DashboardStats {
  cacheHitRatioPct: number;
  activeConnections: number;
  maxConnections: number;
  storageUsedBytes: number;
  tableCount: number;
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
  const [cacheRow, connRow, maxConnRow, sizeRow, tableRow] = await Promise.all([
    queryOne<{ ratio: string | null }>(
      `select (sum(blks_hit)::float / greatest(sum(blks_hit) + sum(blks_read), 1) * 100)::text as ratio
       from pg_stat_database where datname = current_database()`
    ),
    queryOne<{ count: string }>(`select count(*)::text as count from pg_stat_activity where datname = current_database()`),
    queryOne<{ max_connections: string }>(`select setting as max_connections from pg_settings where name = 'max_connections'`),
    queryOne<{ size_bytes: string }>(`select pg_database_size(current_database())::text as size_bytes`),
    queryOne<{ count: string }>(
      `select count(*)::text as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`
    ),
  ]);

  return {
    cacheHitRatioPct: cacheRow?.ratio ? Math.round(parseFloat(cacheRow.ratio) * 10) / 10 : 0,
    activeConnections: connRow ? parseInt(connRow.count, 10) : 0,
    maxConnections: maxConnRow ? parseInt(maxConnRow.max_connections, 10) : 0,
    storageUsedBytes: sizeRow ? parseInt(sizeRow.size_bytes, 10) : 0,
    tableCount: tableRow ? parseInt(tableRow.count, 10) : 0,
  };
}
