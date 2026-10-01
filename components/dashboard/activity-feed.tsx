import { TerminalSquare, Database, UserCircle, Cog } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { activityFeed, timeAgo, type ActivityItem } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const kindMeta: Record<ActivityItem["kind"], { icon: typeof TerminalSquare; className: string }> = {
  query: { icon: TerminalSquare, className: "text-accent bg-accent-soft" },
  schema: { icon: Database, className: "text-warning bg-warning-soft" },
  user: { icon: UserCircle, className: "text-ink-muted bg-surface-hover" },
  system: { icon: Cog, className: "text-success bg-success-soft" },
};

export function ActivityFeed() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>What&apos;s happened across the database recently.</CardDescription>
        </div>
      </CardHeader>
      <ul className="divide-y divide-border px-4 pb-2">
        {activityFeed.map((item) => {
          const meta = kindMeta[item.kind];
          const Icon = meta.icon;
          return (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", meta.className)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm text-ink-muted">
                <span className="text-ink">{item.actor}</span> {item.action}{" "}
                <span className="font-mono text-ink">{item.target}</span>
              </p>
              <span className="ml-auto shrink-0 text-xs text-ink-faint">{timeAgo(item.at)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
