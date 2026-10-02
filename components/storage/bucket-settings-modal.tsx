"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { StorageBucket } from "@/lib/storage/types";

const MB = 1024 * 1024;

function formatLimitInput(bytes: number | null): string {
  if (bytes === null) return "";
  const value = (bytes / MB).toFixed(8);
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

export function BucketSettingsModal({
  bucket,
  open,
  canManage,
  onClose,
  onSave,
}: {
  bucket: StorageBucket;
  open: boolean;
  canManage: boolean;
  onClose: () => void;
  onSave: (next: StorageBucket) => Promise<void>;
}) {
  const [isPublic, setIsPublic] = useState(bucket.isPublic);
  const [limit, setLimit] = useState(formatLimitInput(bucket.sizeLimitBytes));
  const [originalLimit, setOriginalLimit] = useState(bucket.sizeLimitBytes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsPublic(bucket.isPublic);
    setLimit(formatLimitInput(bucket.sizeLimitBytes));
    setOriginalLimit(bucket.sizeLimitBytes);
    setError(null);
  }, [bucket, open]);

  async function save() {
    if (!canManage || saving) return;
    const clean = limit.trim();
    const limitChanged = clean !== formatLimitInput(originalLimit);
    if (clean && limitChanged && !/^\d+(?:\.\d{1,2})?$/.test(clean)) {
      setError("Enter a non-negative size limit in MB, or leave it blank for unlimited.");
      return;
    }
    const bytes = clean ? (limitChanged ? Math.round(Number(clean) * MB) : originalLimit) : null;
    if (bytes !== null && !Number.isSafeInteger(bytes)) {
      setError("Size limit is too large.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...bucket, isPublic, sizeLimitBytes: bytes });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save bucket settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={`${bucket.displayName} settings`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={() => void save()} loading={saving} disabled={!canManage}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-3">
          <div>
            <p className="text-sm text-ink">Public bucket</p>
            <p className="text-xs text-ink-faint">Anyone with the application’s public object URL can download its files.</p>
          </div>
          <Switch checked={isPublic} onChange={setIsPublic} aria-label="Public bucket" disabled={!canManage || saving} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Size limit (MB)</label>
          <Input
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="Unlimited"
            disabled={!canManage || saving}
          />
          <p className="mt-1 text-[11px] text-ink-faint">
            Enforced for new uploads on the server. Current usage: {Math.ceil(bucket.usedBytes / MB)} MB.
          </p>
        </div>
        {!canManage && <p className="text-xs text-ink-faint">Owner or Admin access is required to change bucket settings.</p>}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
