"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, HardDrive, Loader2, Plug, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import type { DashboardStats } from "@/lib/dashboard/stats-service";

import { startSequentialPolling } from "@/lib/realtime/sequential-polling";

const REFRESH_INTERVAL_MS = 15_000;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Unavailable";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function DashboardLiveMetrics({ initialStats }: { initialStats: DashboardStats | null }) {
  const [stats, setStats] = useState(initialStats);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(initialStats ? new Date() : null);

  useEffect(() => {
    const controller = startSequentialPolling<DashboardStats>({
      intervalMs: REFRESH_INTERVAL_MS,
      onStart: () => setRefreshing(true),
      load: async (signal) => {
        const response = await fetch("/api/dashboard/stats", { cache: "no-store", signal });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !body || typeof body !== "object" || !("stats" in body)) {
          throw new Error("Dashboard metrics are temporarily unavailable.");
        }
        const next = (body as { stats?: unknown }).stats;
        if (!next || typeof next !== "object") throw new Error("Dashboard metrics are temporarily unavailable.");
        return next as DashboardStats;
      },
      onSuccess: (next) => {
        setStats(next);
        setStale(false);
        setRefreshing(false);
        setLastUpdated(new Date());
      },
      onError: () => {
        setStale(true);
        setRefreshing(false);
      },
    });

    return () => {
      controller.stop();
    };
  }, []);

  if (!stats) {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
        <AlertTriangle className="mr-2 inline h-4 w-4" />Live database metrics are unavailable. The dashboard will retry every 15 seconds.
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
        <Badge tone={stale ? "warning" : "success"} dot>{stale ? "Stale snapshot" : refreshing ? "Refreshing" : "Live snapshot"}</Badge>
        {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
        <span>Source: PostgreSQL catalogs · last updated {lastUpdated?.toLocaleTimeString() ?? "unknown"}</span>
        <span>Refreshes every 15 seconds; no historical samples are stored.</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label="Cache hit ratio"
          value={stats.cacheHitRatioPct === null ? "Unavailable" : `${stats.cacheHitRatioPct}%`}
          sublabel={stats.cacheHitRatioPct === null ? "No block activity sample is available" : stats.cacheHitRatioPct >= 99 ? "Excellent" : stats.cacheHitRatioPct >= 95 ? "Good" : "Needs attention"}
          tone={stats.cacheHitRatioPct !== null && stats.cacheHitRatioPct >= 95 ? "success" : "accent"}
        />
        <StatCard icon={Plug} label="Current database connections" value={`${stats.activeConnections} / ${stats.maxConnections}`} sublabel="PostgreSQL snapshot, not Node pool occupancy" />
        <StatCard icon={HardDrive} label="Database size" value={formatBytes(stats.databaseSizeBytes)} sublabel={stats.databaseSizeBytes === null ? "No valid current size sample is available" : "Excludes S3 object Storage usage"} />
        <StatCard icon={Table2} label="Tables" value={stats.tableCount === null ? "Unavailable" : String(stats.tableCount)} sublabel={stats.tableCount === null ? "No valid table count is available" : "Base tables in public schema"} />
      </div>
    </>
  );
}
