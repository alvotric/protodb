import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { DatabasePageClient } from "@/components/database/database-page-client";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";

/**
 * Phases 3-5 — Database Explorer, Table View & Data Management, and
 * Schema Designer & Visualizer. Updated in Phase 10 (Part 2): once a
 * database is connected, "Live Database" (real schema/table/row data,
 * real CRUD) becomes the default view -- see
 * real-database-explorer.tsx. The mock Explorer and Schema Diagram
 * stay available too (Schema Diagram's real DDL execution is a later
 * Phase 10 continuation).
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
