import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { TablesOverview } from "@/components/dashboard/tables-overview";
import { DashboardLiveMetrics } from "@/components/dashboard/dashboard-live-metrics";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getDashboardStats, getRecentDashboardActivity } from "@/lib/dashboard/stats-service";
import { listSchemaTables } from "@/lib/database/schema-service";
import { canReadAudit } from "@/lib/audit/audit-query";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!isDatabaseConfigured()) {
    return (
      <AppShell title="Dashboard" user={user}>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-20 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-warning/25 bg-warning-soft text-warning">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-medium text-ink">No database connected</h2>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            Add <code className="rounded bg-surface-hover px-1 py-0.5 text-xs">DATABASE_URL</code> and run the documented migrations.
          </p>
        </div>
      </AppShell>
    );
  }

  const [statsResult, tablesResult, activityResult] = await Promise.allSettled([
    getDashboardStats(),
    listSchemaTables(),
    canReadAudit(user.role) ? getRecentDashboardActivity() : Promise.resolve([]),
  ]);
  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
  if (!stats && statsResult.status === "rejected") {
    console.error("Failed to load Dashboard metrics:", statsResult.reason);
  }
  const tables = tablesResult.status === "fulfilled" ? tablesResult.value : [];
  if (tablesResult.status === "rejected") console.error("Failed to load Dashboard table overview:", tablesResult.reason);
  const activity = activityResult.status === "fulfilled" ? activityResult.value : [];
  if (activityResult.status === "rejected") console.error("Failed to load Dashboard audit activity:", activityResult.reason);

  return (
    <AppShell title="Dashboard" user={user}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">An overview of your database, refreshed from PostgreSQL snapshots.</p>
      </div>
      {!stats && (
        <div role="alert" className="mb-4 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          Dashboard statistics are unavailable. Check database connectivity, permissions, and required migrations.
        </div>
      )}
      <DashboardLiveMetrics initialStats={stats} />

      <div className="mt-6">
        <p className="mb-3 text-sm font-medium text-ink-muted">Quick actions</p>
        <QuickActions />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TablesOverview tables={tables} error={tablesResult.status === "rejected" ? "Live table metadata could not be loaded." : null} />
        </div>
        <div className="lg:col-span-2">
          <ActivityFeed
            events={activity}
            unavailable={!canReadAudit(user.role) || activityResult.status === "rejected"}
            unavailableMessage={
              !canReadAudit(user.role)
                ? "Audit activity is available to Owner and Admin accounts only."
                : "Persisted audit activity is temporarily unavailable."
            }
          />
        </div>
      </div>
    </AppShell>
  );
}
