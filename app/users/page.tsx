import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { UsersWorkspace } from "@/components/users/users-workspace";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Phase 8 — Users, Roles & Permissions.
 * Replaces the Phase 1 placeholder. Team member list with invite/role
 * change/suspend/remove, a per-resource permission matrix for the
 * four fixed roles, and a read-only row-level security policy viewer.
 * See users-workspace.tsx. The member roster itself is still
 * lib/mock-data.ts's seed list -- wiring it to the real
 * `protodb_admin.users` table (the same one auth now reads from) is
 * Phase 10's next continuation for this page; today it only gained
 * the real signed-in user for "(you)"/self-role-lock purposes.
 */
export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Users" user={user}>
      <div className="mb-4">
        <p className="text-sm text-ink-muted">Manage who has access and what they can do.</p>
      </div>
      <UsersWorkspace currentUserEmail={user.email} />
    </AppShell>
  );
}
