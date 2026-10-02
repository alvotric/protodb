import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { UsersWorkspace } from "@/components/users/users-workspace";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Phase 8 — Users, Roles & Permissions.
 * Authentication gates access to this page; Users, invitations,
 * resource permission examples, and RLS samples are explicitly demo
 * state. They are not backed by `protodb_admin.users` or PostgreSQL
 * policy catalogs.
 */
export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Users" user={user}>
      <UsersWorkspace />
    </AppShell>
  );
}
