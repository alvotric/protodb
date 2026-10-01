"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ChevronRight,
  Search,
  Upload,
  Grid3x3,
  List,
  Trash2,
  Settings,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileThumb } from "@/components/storage/file-icon";
import { FilePreviewDrawer } from "@/components/storage/file-preview-drawer";
import { detectKind, formatBytes, type StorageFile } from "@/components/storage/storage-types";
import type { StorageBucket } from "@/lib/mock-data";
import { timeAgo } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/**
 * Phase 7 — Storage Management.
 * Upload is genuinely real: dropped/selected files are read via the
 * browser File API, not simulated with a fake progress bar. Text/JSON
 * uploads get their real content read in (FileReader); images get a
 * real object-URL thumbnail. Nothing here is written to a backend --
 * it lives in this component's state for the session, same honesty
 * as every other phase, but the bytes themselves are real while
 * they're here.
 */
export function FileBrowser({
  bucket,
  files,
  onFilesChange,
  onOpenSettings,
  onBack,
}: {
  bucket: StorageBucket;
  files: StorageFile[];
  onFilesChange: (updater: (prev: StorageFile[]) => StorageFile[]) => void;
  onOpenSettings: () => void;
  onBack: () => void;
}) {
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subfolders = useMemo(() => {
    if (folder !== "") return [];
    return Array.from(new Set(files.filter((f) => f.folder !== "").map((f) => f.folder)));
  }, [files, folder]);

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => f.folder === folder && (!q || f.name.toLowerCase().includes(q)));
  }, [files, folder, query]);

  const previewFile = files.find((f) => f.id === previewId) ?? null;

  // Clear a stale selection when navigating between folders, so the
  // "Delete N" count and bulk action always refer to what's actually
  // visible rather than files left behind in a folder you've left.
  useEffect(() => setSelected(new Set()), [folder]);

  async function ingestFiles(fileList: FileList) {
    const entries: StorageFile[] = [];
    for (const file of Array.from(fileList)) {
      const kind = detectKind(file);
      const entry: StorageFile = {
        id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        folder,
        kind,
        sizeBytes: file.size,
        modifiedAt: new Date().toISOString(),
        isUpload: true,
        sourceFile: file,
      };
      if (kind === "image") entry.objectUrl = URL.createObjectURL(file);
      else if (kind === "text" || kind === "json") {
        try {
          entry.content = await file.text();
        } catch {
          // unreadable as text -- keep the entry without content rather than fail the whole upload
        }
      }
      entries.push(entry);
    }
    onFilesChange((prev) => [...entries, ...prev]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void ingestFiles(e.dataTransfer.files);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDeleteSelected() {
    onFilesChange((prev) => {
      for (const f of prev) {
        if (selected.has(f.id) && f.objectUrl) URL.revokeObjectURL(f.objectUrl);
      }
      return prev.filter((f) => !selected.has(f.id));
    });
    setSelected(new Set());
    setConfirmDeleteOpen(false);
  }

  function handleRename(id: string, name: string) {
    onFilesChange((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }

  function handleDeleteOne(id: string) {
    onFilesChange((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.objectUrl) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((f) => f.id !== id);
    });
    setPreviewId(null);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className="relative flex h-full flex-col"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-hover">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1 font-mono text-sm text-ink-muted">
          <button onClick={() => setFolder("")} className={cn(folder === "" ? "text-ink" : "hover:text-ink")}>
            {bucket.name}
          </button>
          {folder !== "" && (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-ink">{folder}</span>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="w-40">
            <Input
              icon={<Search className="h-3.5 w-3.5" />}
              placeholder="Search files…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="glass flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <button
              onClick={() => setView("list")}
              className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "list" ? "bg-accent-soft text-accent" : "text-ink-faint hover:text-ink-muted")}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("grid")}
              className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "grid" ? "bg-accent-soft text-accent" : "text-ink-faint hover:text-ink-muted")}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
            </button>
          </div>
          {selected.size > 0 && (
            <Button size="sm" variant="danger" onClick={() => setConfirmDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size}
            </Button>
          )}
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
          <button onClick={onOpenSettings} aria-label="Bucket settings" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-hover">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void ingestFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex-1 overflow-y-auto p-3">
        {subfolders.length === 0 && visibleFiles.length === 0 ? (
          <EmptyState
            icon={Upload}
            title="No files here yet"
            description="Drag files in, or use the Upload button above."
            className="h-full"
          />
        ) : view === "list" ? (
          <div className="divide-y divide-border">
            {subfolders.map((name) => (
              <button
                key={name}
                onClick={() => setFolder(name)}
                className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-hover/50"
              >
                <FileThumb kind="other" isFolder size="sm" />
                <span className="flex-1 font-mono text-sm text-ink">{name}</span>
                <span className="text-xs text-ink-faint">Folder</span>
              </button>
            ))}
            {visibleFiles.map((f) => (
              <div key={f.id} className="flex items-center gap-3 py-2.5 hover:bg-surface-hover/50">
                <input
                  type="checkbox"
                  checked={selected.has(f.id)}
                  onChange={() => toggleSelected(f.id)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-border accent-accent"
                />
                <button onClick={() => setPreviewId(f.id)} className="flex flex-1 items-center gap-3 text-left">
                  <FileThumb kind={f.kind} objectUrl={f.objectUrl} size="sm" />
                  <span className="truncate font-mono text-sm text-ink">{f.name}</span>
                </button>
                <span className="shrink-0 text-xs text-ink-faint">{formatBytes(f.sizeBytes)}</span>
                <span className="w-20 shrink-0 text-right text-xs text-ink-faint">{timeAgo(f.modifiedAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {subfolders.map((name) => (
              <button
                key={name}
                onClick={() => setFolder(name)}
                className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 hover:bg-surface-hover/50"
              >
                <FileThumb kind="other" isFolder />
                <span className="w-full truncate text-center font-mono text-xs text-ink">{name}</span>
              </button>
            ))}
            {visibleFiles.map((f) => (
              <button
                key={f.id}
                onClick={() => setPreviewId(f.id)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-3 hover:bg-surface-hover/50",
                  selected.has(f.id) ? "border-accent-line" : "border-border"
                )}
              >
                <FileThumb kind={f.kind} objectUrl={f.objectUrl} />
                <span className="w-full truncate text-center font-mono text-xs text-ink">{f.name}</span>
                <span className="text-[11px] text-ink-faint">{formatBytes(f.sizeBytes)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-accent-soft">
          <p className="rounded-lg bg-canvas px-4 py-2 text-sm text-accent shadow-raised">Drop to upload</p>
        </div>
      )}

      <FilePreviewDrawer file={previewFile} onClose={() => setPreviewId(null)} onRename={handleRename} onDelete={handleDeleteOne} />

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete ${selected.size} file${selected.size === 1 ? "" : "s"}?`}
        description="This removes them from the bucket for this session. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteSelected}
      />
    </div>
  );
}
