import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { QueriesWorkspace } from "@/components/queries/queries-workspace";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Phase 6 — Advanced SQL Editor & Results.
 * Replaces the Phase 1 placeholder. See queries-workspace.tsx for the
 * full breakdown: hand-rolled highlighted editor (no dependency),
 * basic autocomplete, a mock query engine that honestly simulates
 * simple SELECTs against real mock table data, tabs, history, and
 * saved queries. Real SQL execution against the connected database is
 * Phase 10's next continuation for this page.
 */
export default async function QueriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Queries" user={user}>
      <div className="mb-4">
        <p className="text-sm text-ink-muted">Run SQL against your database.</p>
      </div>
      <QueriesWorkspace currentUserEmail={user.email} />
    </AppShell>
  );
}
