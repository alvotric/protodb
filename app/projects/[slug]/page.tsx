import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ProjectDetailClient } from "@/components/projects/project-detail-client";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { slug } = await params;

  return (
    <AppShell title="Project" user={user}>
      <ProjectDetailClient slug={slug} />
    </AppShell>
  );
}
