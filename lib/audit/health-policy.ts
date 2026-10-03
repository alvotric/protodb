export type CurrentHealthStats = {
  activeConnections: number;
  maxConnections: number;
};

export type SystemHealthSnapshot = {
  source: "postgresql";
  capturedAt: string;
  connections: {
    active: number;
    maximum: number;
    source: "pg_stat_activity / pg_settings";
    temporalKind: "snapshot";
  };
  slowQueryHistory: { available: false; message: string };
  historicalErrorRate: { available: false; message: string };
  connectionHistory: { available: false; message: string };
};

export function createSystemHealthSnapshot(stats: CurrentHealthStats, capturedAt: Date): SystemHealthSnapshot {
  if (!Number.isSafeInteger(stats.activeConnections) || stats.activeConnections < 0 ||
      !Number.isSafeInteger(stats.maxConnections) || stats.maxConnections < 1) {
    throw new Error("PostgreSQL returned invalid connection metrics.");
  }
  if (Number.isNaN(capturedAt.getTime())) throw new Error("Snapshot timestamp is invalid.");

  return {
    source: "postgresql",
    capturedAt: capturedAt.toISOString(),
    connections: {
      active: stats.activeConnections,
      maximum: stats.maxConnections,
      source: "pg_stat_activity / pg_settings",
      temporalKind: "snapshot",
    },
    slowQueryHistory: {
      available: false,
      message: "Slow-query history unavailable — no configured historical source is available.",
    },
    historicalErrorRate: {
      available: false,
      message: "Historical error rate unavailable — no persisted time series is available.",
    },
    connectionHistory: {
      available: false,
      message: "Connection history unavailable — no persisted time series is available.",
    },
  };
}
