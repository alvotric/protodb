import { Activity, AlertTriangle, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";
import { connectionPoolSeries, errorRateSeries, slowQueryLog, timeAgo, dbHealth } from "@/lib/mock-data";

export function SystemHealthPanel() {
  const currentErrorRate = errorRateSeries[errorRateSeries.length - 1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Activity className="h-4 w-4" />
            </div>
            <Sparkline data={connectionPoolSeries} className="h-8 w-24 text-accent" />
          </div>
          <p className="mt-4 text-xs text-ink-muted">Connection pool</p>
          <p className="mt-1 text-2xl font-medium text-ink">
            {dbHealth.activeConnections} <span className="text-sm text-ink-faint">/ {dbHealth.maxConnections}</span>
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div
              className={
                currentErrorRate > 1
                  ? "flex h-9 w-9 items-center justify-center rounded-lg bg-danger-soft text-danger"
                  : "flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success"
              }
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <Sparkline data={errorRateSeries} className={currentErrorRate > 1 ? "h-8 w-24 text-danger" : "h-8 w-24 text-success"} />
          </div>
          <p className="mt-4 text-xs text-ink-muted">Error rate</p>
          <p className="mt-1 text-2xl font-medium text-ink">{currentErrorRate.toFixed(1)}%</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Slow query log</CardTitle>
            <CardDescription>Queries that took longer than 2 seconds to complete.</CardDescription>
          </div>
          <Clock className="h-4 w-4 shrink-0 text-ink-faint" />
        </CardHeader>
        <div className="px-4 pb-4">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Query</TableHeaderCell>
                <TableHeaderCell>Duration</TableHeaderCell>
                <TableHeaderCell>When</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {slowQueryLog.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell mono className="max-w-md truncate text-ink">
                    {entry.sql}
                  </TableCell>
                  <TableCell mono className="text-warning">
                    {(entry.durationMs / 1000).toFixed(1)}s
                  </TableCell>
                  <TableCell className="text-ink-faint">{timeAgo(entry.at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
