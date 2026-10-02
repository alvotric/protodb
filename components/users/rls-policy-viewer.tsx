import { ShieldCheck, ShieldOff, Table2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { DemoRlsTable } from "@/lib/users/phase8-demo";

export function RlsPolicyViewer({ tables }: { tables: DemoRlsTable[] }) {
  if (tables.length === 0) {
    return (
      <Card className="p-1">
        <EmptyState
          icon={Table2}
          title="No demo RLS table samples"
          description="No sample policies are available. The target database has not been queried."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tables.map((table) => (
        <Card key={`${table.schema}.${table.table}`} className="p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Table2 className="h-4 w-4 text-ink-faint" />
            <span className="font-mono text-sm text-ink">{table.schema}.{table.table}</span>
            <div className="ml-auto flex items-center gap-2">
              <Badge tone="warning">Demo sample</Badge>
              <Badge tone={table.rlsEnabled ? "success" : "neutral"}>
                {table.rlsEnabled ? <><ShieldCheck className="h-3 w-3" /> RLS enabled (sample)</> : <><ShieldOff className="h-3 w-3" /> RLS disabled (sample)</>}
              </Badge>
              <Badge tone={table.forceRls ? "warning" : "neutral"}>FORCE RLS: {table.forceRls ? "on" : "off"}</Badge>
            </div>
          </div>

          {table.policies.length > 0 ? (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              {table.policies.map((policy) => (
                <div key={policy.name} className="rounded-lg bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-ink">{policy.name}</span>
                    <Badge tone="accent">{policy.command}</Badge>
                    <Badge tone={policy.mode === "permissive" ? "neutral" : "warning"}>{policy.mode}</Badge>
                    <span className="text-ink-muted">Roles: {policy.roles.length ? policy.roles.join(", ") : "none listed"}</span>
                  </div>
                  <p className="mt-2 break-words font-mono text-[11px] text-ink-faint">USING: {policy.using ?? "Not specified"}</p>
                  <p className="mt-1 break-words font-mono text-[11px] text-ink-faint">WITH CHECK: {policy.withCheck ?? "Not specified"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 border-t border-border pt-3 text-xs text-ink-faint">
              No sample policies are listed for this demo table. This is not a statement about the target database or effective row access.
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
