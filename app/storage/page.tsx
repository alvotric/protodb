import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { StorageWorkspace } from "@/components/storage/storage-workspace";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageStorage, canWriteStorage } from "@/lib/storage/policy";
import { getStorageConfigurationStatus } from "@/lib/storage/config";
import { isDatabaseConfigured } from "@/lib/db/client";

export default async function StoragePage() {
  if (!isDatabaseConfigured()) redirect("/login");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const storage = getStorageConfigurationStatus();
  const mode = storage.mode === "live" ? "live" : storage.mode === "demo" ? "demo" : "unavailable";

  return (
    <AppShell title="Storage" user={user}>
      <div className="mb-4">
        <p className="text-sm text-ink-muted">
          {mode === "live"
            ? "Manage private S3-compatible object storage with PostgreSQL-backed metadata."
            : mode === "demo"
              ? "Explore sample Storage data without a configured object-storage provider."
              : "Storage configuration is incomplete; demo data will not be shown as a fallback."}
        </p>
      </div>
      <StorageWorkspace
        mode={mode}
        unavailableMessage={storage.mode === "unavailable" ? storage.error : undefined}
        canManage={canManageStorage(user)}
        canWrite={canWriteStorage(user)}
      />
    </AppShell>
  );
}
