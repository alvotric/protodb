"use client";

import { useMemo, useState } from "react";
import { BucketCard } from "@/components/storage/bucket-card";
import { BucketSettingsModal } from "@/components/storage/bucket-settings-modal";
import { FileBrowser } from "@/components/storage/file-browser";
import type { StorageFile } from "@/components/storage/storage-types";
import { storageBuckets, storageFiles, type StorageBucket } from "@/lib/mock-data";

type WorkspaceFile = StorageFile & { bucketId: string };

/**
 * Phase 7 — Storage Management.
 * Keeps one flat file list tagged with `bucketId` rather than a
 * per-bucket map, so a file never has to be "moved" between two
 * separate state trees -- opening a bucket just filters this list,
 * and `FileBrowser`'s updates get re-tagged with the open bucket's id
 * on the way back in. Bucket settings and files both live in
 * component state only; nothing persists past a refresh (Phase 10).
 */
export function StorageWorkspace() {
  const [buckets, setBuckets] = useState<StorageBucket[]>(storageBuckets);
  const [allFiles, setAllFiles] = useState<WorkspaceFile[]>(() =>
    storageFiles.map((f) => ({
      id: f.id,
      name: f.name,
      folder: f.folder,
      kind: f.kind,
      sizeBytes: f.sizeBytes,
      modifiedAt: f.modifiedAt,
      content: f.content,
      bucketId: f.bucketId,
    }))
  );
  const [openBucketId, setOpenBucketId] = useState<string | null>(null);
  const [settingsBucketId, setSettingsBucketId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const map = new Map<string, { fileCount: number; usedBytes: number }>();
    for (const bucket of buckets) {
      const bucketFiles = allFiles.filter((f) => f.bucketId === bucket.id);
      map.set(bucket.id, {
        fileCount: bucketFiles.length,
        usedBytes: bucketFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
      });
    }
    return map;
  }, [buckets, allFiles]);

  const openBucket = buckets.find((b) => b.id === openBucketId) ?? null;
  const settingsBucket = buckets.find((b) => b.id === settingsBucketId) ?? null;
  const bucketFiles = openBucketId ? allFiles.filter((f) => f.bucketId === openBucketId) : [];

  function handleBucketFilesChange(updater: (prev: StorageFile[]) => StorageFile[]) {
    if (!openBucketId) return;
    setAllFiles((prev) => {
      const thisBucket = prev.filter((f) => f.bucketId === openBucketId);
      const others = prev.filter((f) => f.bucketId !== openBucketId);
      const updated = updater(thisBucket).map((f) => ({ ...f, bucketId: openBucketId }));
      return [...others, ...updated];
    });
  }

  if (openBucket) {
    return (
      <div className="glass h-[75vh] min-h-[520px] overflow-hidden rounded-xl border border-border shadow-panel">
        <FileBrowser
          bucket={openBucket}
          files={bucketFiles}
          onFilesChange={handleBucketFilesChange}
          onOpenSettings={() => setSettingsBucketId(openBucket.id)}
          onBack={() => setOpenBucketId(null)}
        />
        {settingsBucket && (
          <BucketSettingsModal
            bucket={settingsBucket}
            open={settingsBucketId !== null}
            onClose={() => setSettingsBucketId(null)}
            onSave={(next) => setBuckets((prev) => prev.map((b) => (b.id === next.id ? next : b)))}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {buckets.map((bucket) => {
        const s = stats.get(bucket.id) ?? { fileCount: 0, usedBytes: 0 };
        return (
          <BucketCard
            key={bucket.id}
            bucket={bucket}
            fileCount={s.fileCount}
            usedBytes={s.usedBytes}
            onOpen={() => setOpenBucketId(bucket.id)}
          />
        );
      })}
    </div>
  );
}
