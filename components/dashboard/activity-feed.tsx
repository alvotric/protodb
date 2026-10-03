import { Activity, AlertTriangle, CheckCircle2, CircleX } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { DashboardActivity } from "@/lib/dashboard/stats-service";
import { cn } from "@/lib/utils";

function timeAgo(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeed({
  events,
  unavailable = false,
  unavailableMessage,
}: {
  events: DashboardActivity[];
  unavailable?: boolean;
  unavailableMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Latest persisted audit events. This is not a complete activity history.</CardDescription>
        </div>
      </CardHeader>
      {unavailable ? (
        <div className="flex items-start gap-2 px-4 pb-4 text-sm text-ink-muted">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{unavailableMessage ?? "Audit activity is available to Owner and Admin accounts only."}</p>
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={Activity} title="No audit activity yet" description="Persisted audit events will appear here after supported actions." className="py-8" />
      ) : (
        <ul className="divide-y divide-border px-4 pb-2">
          {events.map((event) => {
            const Icon = event.result === "success" ? CheckCircle2 : CircleX;
            return (
              <li key={event.id} className="flex items-start gap-3 py-3">
                <span className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  event.result === "success" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                )}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <p className="min-w-0 text-sm text-ink-muted">
                  <span className="text-ink">{event.actor}</span>{" "}
                  <span className="font-mono">{event.action}</span>{" "}
                  <span className="font-mono text-ink">{event.resource}</span>
                </p>
                <span className="ml-auto shrink-0 text-xs text-ink-faint" title={new Date(event.at).toLocaleString()}>{timeAgo(event.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
