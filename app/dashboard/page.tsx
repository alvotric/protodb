import { redirect } from "next/navigation";
import { Activity, Plug, HardDrive, Table2, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { TablesOverview } from "@/components/dashboard/tables-overview";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getDashboardStats } from "@/lib/dashboard/stats-service";
import { connectionsSeries } from "@/lib/mock-data";

/**
 * Phase 10 — Backend API & Real Data Integration (Part 1).
 *
 * Stat cards are now genuinely real: `getDashboardStats()` queries
 * Postgres's own system catalogs directly (this is a Server
 * Component, so no self-fetch through its own API route). "Recent
 * activity" and "Tables" below still come from lib/mock-data.ts --
 * Database Explorer and Audit Log get their own real-data pass in
 * Phase 10's next continuation, in roadmap order, same as every
 * other phase before this one was built one at a time.
 *
 * `getCurrentUser()` replaces the implicit "always signed in as
 * Amelia Cross" every earlier phase assumed -- middleware.ts already
 * redirects a request with no session cookie at all, but the
 * `redirect()` here is the real check (session actually valid in the
 * database), for the same defense-in-depth reason auth code almost
 * always checks twice.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!isDatabaseConfigured()) {
    return (
      <AppShell title="Dashboard" user={user}>
        <DatabaseNotConfigured />
      </AppShell>
    );
  }

  let stats;
  let loadError: string | null = null;
  try {
    stats = await getDashboardStats();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to query the database.";
  }

  return (
    <AppShell title="Dashboard" user={user}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">An overview of your database, right now.</p>
        <Badge tone={stats ? "success" : "danger"} dot>
          {stats ? "Connected" : "Error"}
        </Badge>
      </div>

      {loadError || !stats ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Couldn&apos;t load stats: {loadError}. Have you run{" "}
            <code className="rounded bg-black/20 px-1 py-0.5 text-xs">migrations/001_protodb_admin_schema.sql</code> against
            this database?
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Activity}
            label="Cache hit ratio"
            value={`${stats.cacheHitRatioPct}%`}
            sublabel={stats.cacheHitRatioPct >= 99 ? "Excellent" : stats.cacheHitRatioPct >= 95 ? "Good" : "Needs attention"}
            tone={stats.cacheHitRatioPct >= 95 ? "success" : "accent"}
          />
          <StatCard
            icon={Plug}
            label="Active connections"
            value={`${stats.activeConnections} / ${stats.maxConnections}`}
            series={connectionsSeries}
          />
          <StatCard icon={HardDrive} label="Database size" value={formatBytes(stats.storageUsedBytes)} />
          <StatCard icon={Table2} label="Tables" value={String(stats.tableCount)} sublabel="in the public schema" />
        </div>
      )}

      <div className="mt-6">
        <p className="mb-3 text-sm font-medium text-ink-muted">Quick actions</p>
        <QuickActions />
      </div>

      <div className="mt-6 flex items-center gap-1.5 text-xs text-ink-faint">
        <AlertTriangle className="h-3 w-3" />
        Recent activity and the tables list below are still preview data — Database Explorer and Audit Log get their own real-data pass next.
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TablesOverview />
        </div>
        <div className="lg:col-span-2">
          <ActivityFeed />
        </div>
      </div>
    </AppShell>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function DatabaseNotConfigured() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-20 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-warning/25 bg-warning-soft text-warning">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-medium text-ink">No database connected</h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        Add <code className="rounded bg-surface-hover px-1 py-0.5 text-xs">DATABASE_URL</code> to your environment (see
        .env.example), run the migration, and reload.
      </p>
    </div>
  );
}
