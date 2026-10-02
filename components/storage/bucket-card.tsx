"use client";

import { Database, Lock, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/components/storage/storage-types";
import type { StorageBucket } from "@/lib/storage/types";

export function BucketCard({
  bucket,
  fileCount,
  usedBytes,
  onOpen,
}: {
  bucket: StorageBucket;
  fileCount: number;
  usedBytes: number;
  onOpen: () => void;
}) {
  const limitBytes = bucket.sizeLimitBytes;
  const pct = limitBytes === null ? null : limitBytes === 0 ? (usedBytes > 0 ? 100 : 0) : Math.min(100, Math.round((usedBytes / limitBytes) * 100));

  return (
    <button onClick={onOpen} className="text-left">
      <Card className="p-5 transition-colors hover:border-border-strong">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Database className="h-5 w-5" />
          </div>
          <Badge tone={bucket.isPublic ? "accent" : "neutral"}>
            {bucket.isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {bucket.isPublic ? "Public" : "Private"}
          </Badge>
        </div>

        <p className="mt-4 font-mono text-[15px] text-ink">{bucket.displayName}</p>
        <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{bucket.name}</p>
        <p className="mt-1 text-xs text-ink-faint">
          {fileCount} file{fileCount === 1 ? "" : "s"} · {formatBytes(usedBytes)}
          {limitBytes !== null ? ` of ${formatBytes(limitBytes)}` : ""}
        </p>

        {pct !== null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-hover">
            <div
              className={pct > 90 ? "h-full rounded-full bg-danger" : "h-full rounded-full bg-accent"}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </Card>
    </button>
  );
}
