import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { UsersPageClient } from "@/components/users/users-page-client";
import { getCurrentUser } from "@/lib/auth/session";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Users" user={user}>
      <UsersPageClient currentUserId={user.id} />
    </AppShell>
  );
}
