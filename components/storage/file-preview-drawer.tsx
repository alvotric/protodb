"use client";

import { useEffect, useState } from "react";
import { Download, Trash2, Pencil, Check, X } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileThumb } from "@/components/storage/file-icon";
import { formatBytes, type StorageFile } from "@/components/storage/storage-types";

/**
 * Phase 7 — Storage Management.
 * Download is only ever offered for files with real bytes behind
 * them -- `sourceFile` (a genuine upload) or `content` (a seed
 * text/json file with real mock content). A seed image/pdf entry has
 * neither, so Download says so plainly instead of producing an empty
 * or fake file.
 */
export function FilePreviewDrawer({
  file,
  onClose,
  onRename,
  onDelete,
}: {
  file: StorageFile | null;
  onClose: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    setRenaming(false);
    if (file) setDraftName(file.name);
  }, [file]);

  if (!file) return null;

  const canDownload = Boolean(file.sourceFile || file.content !== undefined);

  function handleDownload() {
    if (!file) return;
    let blob: Blob;
    if (file.sourceFile) blob = file.sourceFile;
    else if (file.content !== undefined) blob = new Blob([file.content], { type: "text/plain" });
    else return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== file!.name) onRename(file!.id, trimmed);
    setRenaming(false);
  }

  return (
    <Drawer open={file !== null} onClose={onClose} title="File details">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6">
        <FileThumb kind={file.kind} objectUrl={file.objectUrl} size="lg" />
        {renaming ? (
          <div className="flex w-full items-center gap-1.5">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              autoFocus
              className="text-center"
            />
            <button onClick={commitRename} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-success hover:bg-success-soft">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => setRenaming(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-hover">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button onClick={() => setRenaming(true)} className="group flex items-center gap-1.5">
            <span className="break-all text-center font-mono text-sm text-ink">{file.name}</span>
            <Pencil className="h-3 w-3 shrink-0 text-ink-faint opacity-0 group-hover:opacity-100" />
          </button>
        )}
        <p className="text-xs text-ink-faint">
          {formatBytes(file.sizeBytes)} · {new Date(file.modifiedAt).toLocaleString()}
        </p>
      </div>

      {(file.kind === "text" || file.kind === "json") && file.content !== undefined && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Preview</p>
          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-canvas p-3 font-mono text-[12px] leading-5 text-ink-muted">
            {file.content}
          </pre>
        </div>
      )}

      {!canDownload && (
        <p className="mt-4 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs text-ink-faint">
          This preview file has no real bytes behind it, so there&apos;s nothing to download -- try one of the text/JSON files, or drag in a real file to see this work for real.
        </p>
      )}

      <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
        <Button size="sm" variant="secondary" onClick={handleDownload} disabled={!canDownload} className="flex-1">
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
        <Button size="sm" variant="danger" onClick={() => onDelete(file.id)}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </Drawer>
  );
}
