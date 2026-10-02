import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { QueriesWorkspace } from "@/components/queries/queries-workspace";
import { getCurrentUser } from "@/lib/auth/session";
import { canExecuteSql } from "@/lib/auth/authorization";
import { isDatabaseConfigured } from "@/lib/db/client";

export default async function QueriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const databaseConfigured = isDatabaseConfigured();
  return (
    <AppShell title="Queries" user={user}>
      <div className="mb-4">
        <p className="text-sm text-ink-muted">
          {databaseConfigured
            ? "Run a single PostgreSQL statement against your database."
            : "Explore the SQL Editor with clearly labeled sample data."}
        </p>
      </div>
      <QueriesWorkspace databaseConfigured={databaseConfigured} canRunSql={canExecuteSql(user)} />
    </AppShell>
  );
}
