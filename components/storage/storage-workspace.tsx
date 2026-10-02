"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Database } from "lucide-react";
import { BucketCard } from "@/components/storage/bucket-card";
import { BucketSettingsModal } from "@/components/storage/bucket-settings-modal";
import { FileBrowser } from "@/components/storage/file-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { storageBuckets, storageFiles } from "@/lib/mock-data";
import type { StorageBucket, StorageObject, StorageObjectPage } from "@/lib/storage/types";
import type { StorageFile } from "@/components/storage/storage-types";

export type StorageMode = "demo" | "live" | "unavailable";

interface ApiObjectsResponse extends StorageObjectPage { ok: true }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function apiError(response: Response, body: unknown): string {
  if (isRecord(body) && typeof body.error === "string") return body.error;
  return `Storage request failed (${response.status}).`;
}

function isBucket(value: unknown): value is StorageBucket {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.displayName === "string" &&
    typeof value.isPublic === "boolean" &&
    (value.sizeLimitBytes === null || typeof value.sizeLimitBytes === "number") &&
    typeof value.objectCount === "number" &&
    typeof value.usedBytes === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string";
}

function isObject(value: unknown): value is StorageObject {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.bucketId === "string" &&
    typeof value.name === "string" &&
    typeof value.folder === "string" &&
    typeof value.contentType === "string" &&
    typeof value.kind === "string" &&
    typeof value.sizeBytes === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string";
}

function isObjectsResponse(value: unknown): value is ApiObjectsResponse {
  return isRecord(value) && value.ok === true &&
    Array.isArray(value.objects) && value.objects.every(isObject) &&
    Array.isArray(value.folders) && value.folders.every((folder) => typeof folder === "string") &&
    typeof value.page === "number" && typeof value.pageSize === "number" && typeof value.total === "number";
}

function toDemoBucket(bucket: (typeof storageBuckets)[number]): StorageBucket {
  const bucketFiles = storageFiles.filter((file) => file.bucketId === bucket.id);
  return {
    id: bucket.id,
    name: bucket.name,
    displayName: bucket.name,
    isPublic: bucket.public,
    sizeLimitBytes: bucket.sizeLimitMb === null ? null : bucket.sizeLimitMb * 1024 * 1024,
    objectCount: bucketFiles.length,
    usedBytes: bucketFiles.reduce((sum, file) => sum + file.sizeBytes, 0),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function toFile(object: StorageObject): StorageFile {
  return {
    id: object.id,
    bucketId: object.bucketId,
    name: object.name,
    folder: object.folder,
    kind: object.kind,
    sizeBytes: object.sizeBytes,
    modifiedAt: object.updatedAt,
    contentType: object.contentType,
    etag: object.etag,
    checksum: object.checksum,
  };
}

function toDemoFile(file: (typeof storageFiles)[number]): StorageFile {
  return {
    id: file.id,
    bucketId: file.bucketId,
    name: file.name,
    folder: file.folder,
    kind: file.kind,
    sizeBytes: file.sizeBytes,
    modifiedAt: file.modifiedAt,
    content: file.content,
    contentType: file.kind === "json" ? "application/json" : file.kind === "text" ? "text/plain" : undefined,
  };
}

export function StorageWorkspace({
  mode,
  unavailableMessage,
  canManage,
  canWrite,
}: {
  mode: StorageMode;
  unavailableMessage?: string;
  canManage: boolean;
  canWrite: boolean;
}) {
  const [buckets, setBuckets] = useState<StorageBucket[]>(() => mode === "demo" ? storageBuckets.map(toDemoBucket) : []);
  const [allFiles, setAllFiles] = useState<StorageFile[]>(() => mode === "demo" ? storageFiles.map(toDemoFile) : []);
  const [openBucketId, setOpenBucketId] = useState<string | null>(null);
  const [settingsBucketId, setSettingsBucketId] = useState<string | null>(null);
  const [bucketLoading, setBucketLoading] = useState(mode === "live");
  const [bucketError, setBucketError] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [folders, setFolders] = useState<string[]>([]);
  const [totalObjects, setTotalObjects] = useState(0);
  const [objectLoading, setObjectLoading] = useState(false);
  const [objectError, setObjectError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const openBucket = buckets.find((bucket) => bucket.id === openBucketId) ?? null;
  const settingsBucket = buckets.find((bucket) => bucket.id === settingsBucketId) ?? null;
  const bucketFiles = openBucketId ? allFiles.filter((file) =>
    mode === "demo"
      ? storageFiles.find((seed) => seed.id === file.id)?.bucketId === openBucketId || file.bucketId === openBucketId
      : file.bucketId === openBucketId
  ) : [];
  const stats = useMemo(() => {
    if (mode === "live") return new Map(buckets.map((bucket) => [bucket.id, {
      fileCount: bucket.objectCount,
      usedBytes: bucket.usedBytes,
    }]));
    const result = new Map<string, { fileCount: number; usedBytes: number }>();
    for (const bucket of buckets) {
      const entries = allFiles.filter((file) =>
        storageFiles.some((seed) => seed.id === file.id && seed.bucketId === bucket.id) ||
        file.bucketId === bucket.id
      );
      result.set(bucket.id, {
        fileCount: entries.length,
        usedBytes: entries.reduce((sum, file) => sum + file.sizeBytes, 0),
      });
    }
    return result;
  }, [allFiles, buckets, mode]);

  const refreshBuckets = useCallback(async () => {
    if (mode !== "live") return;
    setBucketLoading(true);
    setBucketError(null);
    try {
      const response = await fetch("/api/storage/buckets");
      const body: unknown = await readJson(response);
      if (!response.ok || !isRecord(body) || body.ok !== true ||
          !Array.isArray(body.buckets) || !body.buckets.every(isBucket)) {
        throw new Error(apiError(response, body));
      }
      setBuckets(body.buckets);
    } catch (error) {
      setBucketError(error instanceof Error ? error.message : "Could not load Storage buckets.");
    } finally {
      setBucketLoading(false);
    }
  }, [mode]);

  const handleSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(0);
  }, []);
  const handleFolderChange = useCallback((next: string) => {
    setFolder(next);
    setPage(0);
  }, []);

  useEffect(() => { void refreshBuckets(); }, [refreshBuckets]);

  useEffect(() => {
    if (mode !== "live" || !openBucketId) return;
    const controller = new AbortController();
    setObjectLoading(true);
    setObjectError(null);
    const params = new URLSearchParams({
      folder,
      q: search,
      page: String(page),
      pageSize: "50",
    });
    fetch(`/api/storage/buckets/${encodeURIComponent(openBucketId)}/objects?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await readJson(response);
        if (!response.ok || !isObjectsResponse(body)) throw new Error(apiError(response, body));
        setFolders(body.folders);
        setTotalObjects(body.total);
        setAllFiles((previous) => page === 0
          ? body.objects.map(toFile)
          : [...previous, ...body.objects.map(toFile)]);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setObjectError(error instanceof Error ? error.message : "Could not load files from this bucket.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setObjectLoading(false);
      });
    return () => controller.abort();
  }, [folder, mode, openBucketId, page, refreshVersion, search]);

  function openBucketView(id: string) {
    setOpenBucketId(id);
    setFolder("");
    setSearch("");
    setPage(0);
    setTotalObjects(0);
    setFolders([]);
  }

  function handleBucketFilesChange(updater: (previous: StorageFile[]) => StorageFile[]) {
    if (mode !== "demo" || !openBucketId) return;
    setAllFiles((previous) => {
      const knownBucketFiles = previous.filter((file) =>
        storageFiles.some((seed) => seed.id === file.id && seed.bucketId === openBucketId) ||
        file.bucketId === openBucketId
      );
      const otherFiles = previous.filter((file) => !knownBucketFiles.includes(file));
      const updated = updater(knownBucketFiles).map((file) => ({ ...file, bucketId: openBucketId }));
      return [...otherFiles, ...updated];
    });
  }

  async function saveBucketSettings(next: StorageBucket) {
    if (mode === "demo") {
      setBuckets((previous) => previous.map((bucket) => bucket.id === next.id ? next : bucket));
      return;
    }
    const response = await fetch(`/api/storage/buckets/${encodeURIComponent(next.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: next.isPublic, sizeLimitBytes: next.sizeLimitBytes }),
    });
    const body: unknown = await readJson(response);
    if (!response.ok || !isRecord(body) || !isBucket(body.bucket)) throw new Error(apiError(response, body));
    setBuckets((previous) => previous.map((bucket) => bucket.id === next.id ? body.bucket as StorageBucket : bucket));
  }

  async function createBucket() {
    if (!canManage || creating) return;
    const name = createName.trim();
    setCreating(true);
    setCreateError(null);
    try {
      if (mode === "demo") {
        const bucket: StorageBucket = {
          id: `demo-${Date.now()}`,
          name,
          displayName: createDisplayName.trim() || name,
          isPublic: false,
          sizeLimitBytes: null,
          objectCount: 0,
          usedBytes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setBuckets((previous) => [...previous, bucket]);
      } else {
        const response = await fetch("/api/storage/buckets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, displayName: createDisplayName.trim() || name }),
        });
        const body: unknown = await readJson(response);
        if (!response.ok || !isRecord(body) || !isBucket(body.bucket)) throw new Error(apiError(response, body));
        setBuckets((previous) => [...previous, body.bucket as StorageBucket]);
      }
      setCreateOpen(false);
      setCreateName("");
      setCreateDisplayName("");
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create bucket.");
    } finally {
      setCreating(false);
    }
  }

  if (mode === "unavailable") {
    return (
      <ErrorState
        title="Live Storage is unavailable"
        description={unavailableMessage ?? "Storage configuration is incomplete. Demo data is not shown as a fallback."}
      />
    );
  }

  if (openBucket) {
    return (
      <div className="glass h-[75vh] min-h-[520px] overflow-hidden rounded-xl border border-border shadow-panel">
        {mode === "demo" && (
          <div className="border-b border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
            Demo / Offline Storage — changes are temporary and do not persist.
          </div>
        )}
        <FileBrowser
          key={openBucket.id}
          bucket={openBucket}
          files={bucketFiles}
          mode={mode}
          canWrite={canWrite}
          folders={mode === "live" ? folders : undefined}
          loading={objectLoading}
          error={objectError}
          totalObjects={mode === "live" ? totalObjects : bucketFiles.length}
          hasMore={mode === "live" && bucketFiles.length < totalObjects}
          onRetry={() => { setPage(0); setRefreshVersion((version) => version + 1); }}
          onFilesChange={handleBucketFilesChange}
          onFolderChange={handleFolderChange}
          onSearch={handleSearch}
          onLoadMore={() => setPage((value) => value + 1)}
          onRefresh={() => {
            setPage(0);
            setRefreshVersion((version) => version + 1);
            void refreshBuckets();
          }}
          onOpenSettings={() => setSettingsBucketId(openBucket.id)}
          onBack={() => setOpenBucketId(null)}
        />
        {settingsBucket && (
          <BucketSettingsModal
            bucket={settingsBucket}
            open={settingsBucketId !== null}
            canManage={canManage}
            onClose={() => setSettingsBucketId(null)}
            onSave={saveBucketSettings}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {mode === "demo" ? (
        <div className="mb-4 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
          Demo / Offline Storage — sample objects and local changes are temporary. Configure an S3-compatible provider for persistent Storage.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs text-success">
          Live Storage — objects are stored in the configured S3-compatible provider; bucket and file metadata are stored in PostgreSQL.
        </div>
      )}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-muted">
            {buckets.reduce((sum, bucket) => sum + bucket.usedBytes, 0) > 0
              ? `Total usage: ${formatTotalBytes(buckets.reduce((sum, bucket) => sum + bucket.usedBytes, 0))}`
              : "No stored objects yet."}
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => { setCreateError(null); setCreateOpen(true); }}>
            <Plus className="h-3.5 w-3.5" />
            New bucket
          </Button>
        )}
      </div>
      {bucketLoading ? (
        <div className="flex h-48 items-center justify-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading buckets…
        </div>
      ) : bucketError ? (
        <ErrorState
          title="Could not load buckets"
          description={bucketError}
          action={<Button variant="secondary" size="sm" onClick={() => void refreshBuckets()}>Retry</Button>}
        />
      ) : buckets.length === 0 ? (
        <EmptyState icon={Database} title="No buckets yet" description={canManage ? "Create a bucket to start storing files." : "No Storage buckets are available."} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buckets.map((bucket) => {
            const summary = stats.get(bucket.id) ?? { fileCount: 0, usedBytes: 0 };
            return (
              <BucketCard
                key={bucket.id}
                bucket={bucket}
                fileCount={summary.fileCount}
                usedBytes={summary.usedBytes}
                onOpen={() => openBucketView(bucket.id)}
              />
            );
          })}
        </div>
      )}
      <Modal
        open={createOpen}
        onClose={() => { if (!creating) setCreateOpen(false); }}
        title="Create bucket"
        description={mode === "live" ? "Creates an application bucket inside the configured private S3 container." : "Creates a temporary demo bucket."}
        size="sm"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button size="sm" onClick={() => void createBucket()} loading={creating} disabled={!createName.trim()}>Create</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="bucket-name" aria-label="Bucket name" />
          <Input value={createDisplayName} onChange={(event) => setCreateDisplayName(event.target.value)} placeholder="Display name (optional)" aria-label="Bucket display name" />
          <p className="text-xs text-ink-faint">Use 3–63 lowercase letters, numbers, and hyphens.</p>
          {createError && <p role="alert" className="text-xs text-danger">{createError}</p>}
        </div>
      </Modal>
    </div>
  );
}

function formatTotalBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}
