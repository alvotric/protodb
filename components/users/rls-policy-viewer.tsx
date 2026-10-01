import { ShieldCheck, ShieldOff, Table2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { rlsStatus } from "@/lib/mock-data";

/**
 * Phase 8 — Users, Roles & Permissions.
 * Read-only, as the roadmap specifies -- this shows what's configured
 * (mock data shaped like a real `pg_policies` summary would be), it
 * doesn't let you write policies from here. Real RLS is a Postgres
 * feature Phase 10 would read from an actual connection; this is the
 * viewer half only.
 */
export function RlsPolicyViewer() {
  return (
    <div className="space-y-3">
      {rlsStatus.map((table) => (
        <Card key={table.table} className="p-4">
          <div className="flex items-center gap-2.5">
            <Table2 className="h-4 w-4 text-ink-faint" />
            <span className="font-mono text-sm text-ink">{table.table}</span>
            <Badge tone={table.enabled ? "success" : "neutral"} className="ml-auto">
              {table.enabled ? (
                <>
                  <ShieldCheck className="h-3 w-3" />
                  RLS enabled
                </>
              ) : (
                <>
                  <ShieldOff className="h-3 w-3" />
                  RLS disabled
                </>
              )}
            </Badge>
          </div>

          {table.policies.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {table.policies.map((policy) => (
                <div key={policy.name} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-ink">{policy.name}</span>
                  <Badge tone="accent">{policy.command}</Badge>
                  <span className="font-mono text-ink-faint">USING ({policy.using})</span>
                </div>
              ))}
            </div>
          )}

          {table.enabled && table.policies.length === 0 && (
            <p className="mt-3 border-t border-border pt-3 text-xs text-ink-faint">
              RLS is on with no policies defined -- every row is denied by default.
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
