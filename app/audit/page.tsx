import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AuditWorkspace } from "@/components/audit/audit-workspace";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Phase 9 — Audit Logs & System Monitoring.
 * The audit trail reads persisted `protodb_admin.audit_log` records
 * through an Owner/Admin-authorized API. System Health reports a live
 * PostgreSQL snapshot where available and explicitly unavailable
 * historical metrics where no source exists.
 */
export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Audit Log" user={user}>
      <div className="mb-4">
        <p className="text-sm text-ink-muted">Review persisted audit events and source-labeled system health.</p>
      </div>
      <AuditWorkspace />
    </AppShell>
  );
}
