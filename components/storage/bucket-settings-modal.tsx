"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { StorageBucket } from "@/lib/mock-data";

export function BucketSettingsModal({
  bucket,
  open,
  onClose,
  onSave,
}: {
  bucket: StorageBucket;
  open: boolean;
  onClose: () => void;
  onSave: (next: StorageBucket) => void;
}) {
  const [isPublic, setIsPublic] = useState(bucket.public);
  const [limit, setLimit] = useState(bucket.sizeLimitMb?.toString() ?? "");

  useEffect(() => {
    setIsPublic(bucket.public);
    setLimit(bucket.sizeLimitMb?.toString() ?? "");
  }, [bucket, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${bucket.name} settings`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const parsed = limit.trim() === "" ? null : Math.max(1, parseInt(limit, 10) || 1);
              onSave({ ...bucket, public: isPublic, sizeLimitMb: parsed });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-3">
          <div>
            <p className="text-sm text-ink">Public bucket</p>
            <p className="text-xs text-ink-faint">Anyone with a file&apos;s URL can read it, no auth needed.</p>
          </div>
          <Switch checked={isPublic} onChange={setIsPublic} aria-label="Public bucket" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Size limit (MB)</label>
          <Input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Unlimited" />
        </div>
      </div>
    </Modal>
  );
}
