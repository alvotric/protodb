"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, Clock, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { startSequentialPolling, type SequentialPollingController } from "@/lib/realtime/sequential-polling";

const REFRESH_INTERVAL_MS = 15_000;

type HealthSnapshot = {
  source: "postgresql";
  capturedAt: string;
  connections: {
    active: number;
    maximum: number;
    source: string;
    temporalKind: "snapshot";
  };
  slowQueryHistory: { available: false; message: string };
  historicalErrorRate: { available: false; message: string };
  connectionHistory: { available: false; message: string };
};

function isHealthSnapshot(value: unknown): value is HealthSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.source !== "postgresql" || typeof snapshot.capturedAt !== "string") return false;
  if (!snapshot.connections || typeof snapshot.connections !== "object") return false;
  const connections = snapshot.connections as Record<string, unknown>;
  const capturedAt = new Date(snapshot.capturedAt);
  return Number.isSafeInteger(connections.active) && Number(connections.active) >= 0 &&
    Number.isSafeInteger(connections.maximum) && Number(connections.maximum) >= 1 &&
    connections.source === "pg_stat_activity / pg_settings" && connections.temporalKind === "snapshot" &&
    snapshot.capturedAt !== "" && !Number.isNaN(capturedAt.getTime()) &&
    capturedAt.toISOString() === snapshot.capturedAt && validUnavailable(snapshot.slowQueryHistory) &&
    validUnavailable(snapshot.historicalErrorRate) && validUnavailable(snapshot.connectionHistory);
}

function validUnavailable(value: unknown): value is { available: false; message: string } {
  return Boolean(value && typeof value === "object" &&
    "available" in value && (value as { available?: unknown }).available === false &&
    "message" in value && typeof (value as { message?: unknown }).message === "string");
}

function apiError(value: unknown): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
  }
  return "Current database health metrics are unavailable.";
}

export function SystemHealthPanel() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef<SequentialPollingController | null>(null);

  useEffect(() => {
    const controller = startSequentialPolling<HealthSnapshot>({
      intervalMs: REFRESH_INTERVAL_MS,
      onStart: () => setRefreshing(true),
      load: async (signal) => {
        const response = await fetch("/api/audit/health", { signal, cache: "no-store" });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(apiError(body));
        if (!body || typeof body !== "object" || !("snapshot" in body) || !isHealthSnapshot((body as { snapshot?: unknown }).snapshot)) {
          throw new Error("The health API returned an invalid response.");
        }
        return (body as { snapshot: HealthSnapshot }).snapshot;
      },
      onSuccess: (next) => {
        setSnapshot(next);
        setError(null);
        setStale(false);
        setLoading(false);
        setRefreshing(false);
      },
      onError: (cause) => {
        setError(cause instanceof Error ? cause.message : "Current database health metrics are unavailable.");
        setStale(true);
        setLoading(false);
        setRefreshing(false);
      },
    });
    polling.current = controller;
    return () => {
      controller.stop();
      if (polling.current === controller) polling.current = null;
    };
  }, []);

  const refreshSnapshot = () => polling.current?.refresh();

  if (loading) {
    return (
      <div role="status" aria-label="Loading system health snapshot" className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <ErrorState
        title="System health unavailable"
        description={error ?? "Current database health metrics are unavailable."}
        action={<Button variant="secondary" size="sm" onClick={refreshSnapshot}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink">PostgreSQL system snapshot</h2>
          <p className="mt-1 text-xs text-ink-muted">Current database activity and configured maximum; not this app process&apos;s pool occupancy.</p>
        </div>
        <div className="flex items-center gap-3">
          <span role="status" aria-live="polite" className="text-xs text-ink-faint">
            {stale ? "Stale snapshot" : refreshing ? "Refreshing" : "Live snapshot"} · updates every 15 seconds
          </span>
          {refreshing && <Loader2 className="h-3 w-3 animate-spin text-ink-faint" />}
          <Button variant="secondary" size="sm" onClick={refreshSnapshot}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh snapshot
          </Button>
        </div>
      </div>
      {stale && error && (
        <div role="alert" className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
          Refresh failed: {error}. Showing the last successful snapshot while retrying.
        </div>
      )}
      <div className="text-xs text-ink-faint">Snapshot captured {new Date(snapshot.capturedAt).toLocaleString()}. No historical samples are stored.</div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent"><Activity className="h-4 w-4" /></div>
          <p className="mt-4 text-xs text-ink-muted">Current database connections</p>
          <p className="mt-1 text-2xl font-medium text-ink">
            {snapshot.connections.active} <span className="text-sm text-ink-faint">/ {snapshot.connections.maximum}</span>
          </p>
          <p className="mt-1 text-xs text-ink-faint">Source: {snapshot.connections.source} · current snapshot</p>
        </Card>

        <UnavailableMetric
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Historical error rate"
          description={snapshot.historicalErrorRate.message}
          source="No persisted numerator/denominator time series; no percentage is inferred."
        />
      </div>

      <UnavailableMetric
        icon={<Clock className="h-4 w-4" />}
        title="Slow-query history"
        description={snapshot.slowQueryHistory.message}
        source="Phase 6 query history is per-user editor history, not a global PostgreSQL slow-query source."
      />

      <Card className="p-4">
        <CardHeader className="p-0">
          <div>
            <CardTitle className="text-sm">Connection history</CardTitle>
            <CardDescription>{snapshot.connectionHistory.message}</CardDescription>
          </div>
        </CardHeader>
        <p className="mt-3 text-xs text-ink-faint">Source: no persisted samples. This panel refreshes a current snapshot; it is not a historical series.</p>
      </Card>
    </div>
  );
}

function UnavailableMetric({
  icon,
  title,
  description,
  source,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  source: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-warning">{icon}<h3 className="text-sm font-medium text-ink">{title}</h3></div>
      <p className="mt-3 text-sm text-ink-muted">{description}</p>
      <p className="mt-1 text-xs text-ink-faint">Source: {source}</p>
    </Card>
  );
}
