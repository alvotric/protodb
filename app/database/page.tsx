import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { DatabasePageClient } from "@/components/database/database-page-client";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";

/**
 * Database Explorer, Table View & Data Management, and Schema
 * Designer & Visualizer. Both views are backed by the real
 * PostgreSQL connection -- see real-database-explorer.tsx and
 * real-schema-canvas.tsx. The original mock Explorer / Schema
 * components remain in the repository as developer reference only.
 */
export default async function DatabasePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Database" user={user}>
      <DatabasePageClient databaseConfigured={isDatabaseConfigured()} />
    </AppShell>
  );
}
