import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Projects" user={user}>
      <ProjectsWorkspace />
    </AppShell>
  );
}
