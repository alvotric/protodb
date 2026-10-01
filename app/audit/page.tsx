import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AuditWorkspace } from "@/components/audit/audit-workspace";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Phase 9 — Audit Logs & System Monitoring.
 * Replaces the Phase 1 placeholder. A searchable/filterable audit
 * trail and a system health view (connection pool, error rate, slow
 * query log). See audit-workspace.tsx. Still lib/mock-data.ts's seed
 * log for now -- wiring this to the real `protodb_admin.audit_log`
 * table (already being written to by auth routes, see
 * lib/auth/session.ts) is Phase 10's next continuation for this page.
 */
export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Audit Log" user={user}>
      <div className="mb-4">
       <p className="text-sm text-ink-muted">
  Know what happened, and know if something&apos;s wrong.
</p>
      </div>
      <AuditWorkspace />
    </AppShell>
  );
}
