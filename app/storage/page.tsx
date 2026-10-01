import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { StorageWorkspace } from "@/components/storage/storage-workspace";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Phase 7 — Storage Management.
 * Replaces the Phase 1 placeholder. Bucket list with real usage
 * stats, per-bucket file browser (folders, search, list/grid),
 * genuinely real drag-and-drop upload via the browser File API, real
 * text/JSON preview and download, rename, bulk delete, and bucket
 * settings (public/private, size limit). See storage-workspace.tsx.
 */
export default async function StoragePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Storage" user={user}>
      <div className="mb-4">
        <p className="text-sm text-ink-muted">Manage file storage buckets alongside your database.</p>
      </div>
      <StorageWorkspace />
    </AppShell>
  );
}
