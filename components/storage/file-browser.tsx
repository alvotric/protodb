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
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileThumb } from "@/components/storage/file-icon";
import { FilePreviewDrawer } from "@/components/storage/file-preview-drawer";
import { detectKind, formatBytes, type StorageFile } from "@/components/storage/storage-types";
import type { StorageBucket } from "@/lib/storage/types";
import type { StorageMode } from "@/components/storage/storage-workspace";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

interface UploadTicket {
  uploadId: string;
  upload: { url: string; fields: Record<string, string> };
}

interface UploadProgress {
  id: string;
  file: File;
  percent: number;
  error: string | null;
  uploading: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function message(response: Response, body: unknown): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : `Request failed (${response.status}).`;
}

function isUploadTicket(value: unknown): value is UploadTicket {
  return isRecord(value) && typeof value.uploadId === "string" &&
    isRecord(value.upload) && typeof value.upload.url === "string" &&
    isRecord(value.upload.fields) &&
    Object.values(value.upload.fields).every((field) => typeof field === "string");
}

function postFile(url: string, fields: Record<string, string>, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append("file", file, file.name);
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.floor(event.loaded / event.total * 100)));
    };
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(`Object storage rejected the upload (${request.status}).`));
    request.onerror = () => reject(new Error("Network error while uploading file."));
    request.onabort = () => reject(new Error("Upload was cancelled."));
    request.send(form);
  });
}

export function FileBrowser({
  bucket,
  files,
  mode,
  canWrite,
  folders: liveFolders,
  loading,
  error,
  totalObjects,
  hasMore,
  onRetry,
  onFilesChange,
  onFolderChange,
  onSearch,
  onLoadMore,
  onRefresh,
  onOpenSettings,
  onBack,
}: {
  bucket: StorageBucket;
  files: StorageFile[];
  mode: StorageMode;
  canWrite: boolean;
  folders?: string[];
  loading: boolean;
  error: string | null;
  totalObjects: number;
  hasMore: boolean;
  onRetry: () => void;
  onFilesChange: (updater: (prev: StorageFile[]) => StorageFile[]) => void;
  onFolderChange: (folder: string) => void;
  onSearch: (query: string) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onBack: () => void;
}) {
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());

  const subfolders = useMemo(() => {
    if (liveFolders) return liveFolders;
    if (folder !== "") return [];
    return Array.from(new Set(files.filter((file) => file.folder !== "").map((file) => file.folder)));
  }, [files, folder, liveFolders]);

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((file) => file.folder === folder && (!q || file.name.toLowerCase().includes(q)));
  }, [files, folder, query]);

  const previewFile = files.find((file) => file.id === previewId) ?? null;

  useEffect(() => {
    setSelected((previous) => {
      const visible = new Set(visibleFiles.map((file) => file.id));
      return new Set([...previous].filter((id) => visible.has(id)));
    });
  }, [visibleFiles]);

  useEffect(() => {
    const timer = window.setTimeout(() => onSearch(query), 250);
    return () => window.clearTimeout(timer);
  }, [onSearch, query]);

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
  }, []);

  async function uploadOne(file: File, progressId = `${Date.now()}-${Math.random()}`) {
    setOperationError(null);
    setUploads((previous) => {
      const existing = previous.find((upload) => upload.id === progressId);
      if (existing) return previous.map((upload) => upload.id === progressId
        ? { ...upload, error: null, uploading: true, percent: 0 }
        : upload);
      return [...previous.slice(-4), { id: progressId, file, percent: 0, error: null, uploading: true }];
    });

    if (mode === "demo") {
      const kind = detectKind(file);
      const entry: StorageFile = {
        id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        bucketId: bucket.id,
        name: file.name,
        folder,
        kind,
        sizeBytes: file.size,
        modifiedAt: new Date().toISOString(),
        contentType: file.type || "application/octet-stream",
        isUpload: true,
        sourceFile: file,
      };
      if (kind === "image") {
        entry.objectUrl = URL.createObjectURL(file);
        objectUrls.current.add(entry.objectUrl);
      } else if (kind === "text" || kind === "json") {
        entry.content = await file.text();
      }
      onFilesChange((previous) => [entry, ...previous]);
      setUploads((previous) => previous.map((upload) => upload.id === progressId
        ? { ...upload, percent: 100, uploading: false }
        : upload));
      return;
    }

    let ticket: UploadTicket | null = null;
    try {
      const initResponse = await fetch("/api/storage/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucketId: bucket.id,
          name: file.name,
          folder,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      const initBody: unknown = await readJson(initResponse);
      if (!initResponse.ok || !isRecord(initBody) || !isUploadTicket(initBody)) {
        throw new Error(message(initResponse, initBody));
      }
      ticket = initBody;
      await postFile(ticket.upload.url, ticket.upload.fields, file, (percent) => {
        setUploads((previous) => previous.map((upload) => upload.id === progressId ? { ...upload, percent } : upload));
      });
      const completeResponse = await fetch(`/api/storage/uploads/${encodeURIComponent(ticket.uploadId)}/complete`, { method: "POST" });
      const completeBody: unknown = await readJson(completeResponse);
      if (!completeResponse.ok || !isRecord(completeBody) || completeBody.ok !== true) {
        throw new Error(message(completeResponse, completeBody));
      }
      setUploads((previous) => previous.map((upload) => upload.id === progressId
        ? { ...upload, percent: 100, uploading: false }
        : upload));
      onRefresh();
    } catch (failure) {
      if (ticket) {
        await fetch(`/api/storage/uploads/${encodeURIComponent(ticket.uploadId)}`, { method: "DELETE" }).catch(() => undefined);
      }
      const errorText = failure instanceof Error ? failure.message : "Upload failed.";
      setUploads((previous) => previous.map((upload) => upload.id === progressId
        ? { ...upload, error: errorText, uploading: false }
        : upload));
    }
  }

  async function ingestFiles(fileList: FileList) {
    if (!canWrite) return;
    for (const file of Array.from(fileList)) await uploadOne(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) void ingestFiles(event.dataTransfer.files);
  }

  function changeFolder(next: string) {
    setFolder(next);
    onFolderChange(next);
    setSelected(new Set());
  }

  function toggleSelected(id: string) {
    if (!selected.has(id) && selected.size >= 100) {
      setOperationError("Select no more than 100 objects for one bulk delete.");
      return;
    }
    setOperationError(null);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function askDelete(ids: string[]) {
    if (!canWrite || ids.length === 0) return;
    setDeleteIds(ids);
    setConfirmDeleteOpen(true);
    setOperationError(null);
  }

  async function handleDeleteConfirmed() {
    if (deleting || !deleteIds.length) return;
    setDeleting(true);
    setOperationError(null);
    try {
      if (mode === "demo") {
        onFilesChange((previous) => {
          for (const file of previous) {
            if (deleteIds.includes(file.id) && file.objectUrl) {
              URL.revokeObjectURL(file.objectUrl);
              objectUrls.current.delete(file.objectUrl);
            }
          }
          return previous.filter((file) => !deleteIds.includes(file.id));
        });
      } else {
        const response = deleteIds.length === 1
          ? await fetch(`/api/storage/objects/${encodeURIComponent(deleteIds[0])}`, { method: "DELETE" })
          : await fetch("/api/storage/objects/bulk-delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: deleteIds }),
            });
        const body: unknown = await readJson(response);
        if (!response.ok || !isRecord(body) || body.ok !== true) {
          const partial = isRecord(body) && Array.isArray(body.deleted) ? body.deleted.length : 0;
            const failed = isRecord(body) && Array.isArray(body.failed) ? body.failed.length : 0;
            if (partial > 0) onRefresh();
            throw new Error(partial || failed
              ? `${partial} object(s) deleted; ${failed} could not be deleted.`
              : message(response, body));
        }
        onRefresh();
      }
      setSelected(new Set());
      setPreviewId(null);
      setDeleteIds([]);
      setConfirmDeleteOpen(false);
    } catch (failure) {
      setOperationError(failure instanceof Error ? failure.message : "Could not delete selected objects.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRename(id: string, name: string, nextFolder: string) {
    if (!canWrite) throw new Error("Your role is read-only for Storage objects.");
    if (mode === "demo") {
      onFilesChange((previous) => previous.map((file) => file.id === id
        ? { ...file, name, folder: nextFolder, modifiedAt: new Date().toISOString() }
        : file));
      return;
    }
    const response = await fetch(`/api/storage/objects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, folder: nextFolder }),
    });
    const body: unknown = await readJson(response);
    if (!response.ok || !isRecord(body) || body.ok !== true) throw new Error(message(response, body));
    onRefresh();
  }

  return (
    <div
      onDragOver={(event) => {
        if (!canWrite) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className="relative flex h-full flex-col"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-hover" aria-label="Back to buckets">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1 font-mono text-sm text-ink-muted">
          <button onClick={() => changeFolder("")} className={cn(folder === "" ? "text-ink" : "hover:text-ink")}>
            {bucket.displayName}
          </button>
          {folder.split("/").filter(Boolean).map((part, index, parts) => {
            const path = parts.slice(0, index + 1).join("/");
            return (
              <span key={path} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                <button onClick={() => changeFolder(path)} className={index === parts.length - 1 ? "text-ink" : "hover:text-ink"}>
                  {part}
                </button>
              </span>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="w-40">
            <Input
              icon={<Search className="h-3.5 w-3.5" />}
              placeholder="Search files…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8"
              aria-label="Search files"
            />
          </div>
          <div className="glass flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <button onClick={() => setView("list")} aria-label="List view" aria-pressed={view === "list"} className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "list" ? "bg-accent-soft text-accent" : "text-ink-faint hover:text-ink-muted")}>
              <List className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setView("grid")} aria-label="Grid view" aria-pressed={view === "grid"} className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "grid" ? "bg-accent-soft text-accent" : "text-ink-faint hover:text-ink-muted")}>
              <Grid3x3 className="h-3.5 w-3.5" />
            </button>
          </div>
          {selected.size > 0 && canWrite && (
            <Button size="sm" variant="danger" onClick={() => askDelete([...selected])}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size}
            </Button>
          )}
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={!canWrite}>
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
        onChange={(event) => {
          if (event.target.files) void ingestFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="flex-1 overflow-y-auto p-3">
        {operationError && <p role="alert" className="mb-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">{operationError}</p>}
        {uploads.map((upload) => (
          <div key={upload.id} className="mb-2 rounded-lg border border-border bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              {upload.uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
              <span className="min-w-0 flex-1 truncate text-xs text-ink">{upload.file.name}</span>
              {upload.uploading ? <span className="text-xs text-ink-faint">{upload.percent}%</span> : upload.error ? (
                <Button size="sm" variant="secondary" onClick={() => void uploadOne(upload.file, upload.id)}>Retry</Button>
              ) : <span className="text-xs text-success">Uploaded</span>}
            </div>
            {upload.uploading && (
              <div className="mt-2 h-1 overflow-hidden rounded bg-surface-hover">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${upload.percent}%` }} />
              </div>
            )}
            {upload.error && <p role="alert" className="mt-1 text-xs text-danger">{upload.error}</p>}
          </div>
        ))}

        {loading && files.length === 0 ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading objects…
          </div>
        ) : error && files.length === 0 ? (
          <ErrorState
            title="Could not load objects"
            description={error}
            action={<Button variant="secondary" size="sm" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>}
          />
        ) : subfolders.length === 0 && visibleFiles.length === 0 ? (
          <EmptyState
            icon={Upload}
            title={query ? "No matching files" : "No files here yet"}
            description={query ? "Try a different search." : canWrite ? "Drag files in, or use the Upload button above." : "This folder is empty."}
            className="h-full"
          />
        ) : view === "list" ? (
          <div className="divide-y divide-border">
            {subfolders.map((name) => {
              const childFolder = folder ? `${folder}/${name}` : name;
              return (
                <button key={childFolder} onClick={() => changeFolder(childFolder)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-hover/50">
                  <FileThumb kind="other" isFolder size="sm" />
                  <span className="flex-1 font-mono text-sm text-ink">{name}</span>
                  <span className="text-xs text-ink-faint">Folder</span>
                </button>
              );
            })}
            {visibleFiles.map((file) => (
              <div key={file.id} className="flex items-center gap-3 py-2.5 hover:bg-surface-hover/50">
                <input type="checkbox" checked={selected.has(file.id)} onChange={() => toggleSelected(file.id)} aria-label={`Select ${file.name}`} disabled={!canWrite} className="h-3.5 w-3.5 shrink-0 rounded border-border accent-accent" />
                <button onClick={() => setPreviewId(file.id)} className="flex flex-1 items-center gap-3 text-left">
                  <FileThumb kind={file.kind} objectUrl={file.objectUrl} size="sm" />
                  <span className="truncate font-mono text-sm text-ink">{file.name}</span>
                </button>
                <span className="shrink-0 text-xs text-ink-faint">{formatBytes(file.sizeBytes)}</span>
                <span className="w-20 shrink-0 text-right text-xs text-ink-faint">{timeAgo(file.modifiedAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {subfolders.map((name) => {
              const childFolder = folder ? `${folder}/${name}` : name;
              return (
                <button key={childFolder} onClick={() => changeFolder(childFolder)} className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 hover:bg-surface-hover/50">
                  <FileThumb kind="other" isFolder />
                  <span className="w-full truncate text-center font-mono text-xs text-ink">{name}</span>
                </button>
              );
            })}
            {visibleFiles.map((file) => (
              <div key={file.id} className={cn("relative flex flex-col items-center gap-2 rounded-lg border p-3", selected.has(file.id) ? "border-accent-line" : "border-border")}>
                <input type="checkbox" checked={selected.has(file.id)} onChange={() => toggleSelected(file.id)} aria-label={`Select ${file.name}`} disabled={!canWrite} className="absolute left-2 top-2 h-3.5 w-3.5 rounded border-border accent-accent" />
                <button onClick={() => setPreviewId(file.id)} className="flex w-full flex-col items-center gap-2">
                  <FileThumb kind={file.kind} objectUrl={file.objectUrl} />
                  <span className="w-full truncate text-center font-mono text-xs text-ink">{file.name}</span>
                  <span className="text-[11px] text-ink-faint">{formatBytes(file.sizeBytes)}</span>
                </button>
              </div>
            ))}
          </div>
        )}
        {loading && files.length > 0 && <p role="status" className="py-3 text-center text-xs text-ink-faint">Refreshing files…</p>}
        {error && files.length > 0 && <p role="alert" className="py-3 text-center text-xs text-danger">{error} <button className="underline" onClick={onRetry}>Retry</button></p>}
        {hasMore && (
          <div className="flex justify-center py-4">
            <Button size="sm" variant="secondary" onClick={onLoadMore} loading={loading}>
              Load more ({Math.max(0, totalObjects - files.length)} remaining)
            </Button>
          </div>
        )}
      </div>

      {dragOver && canWrite && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-accent-soft">
          <p className="rounded-lg bg-canvas px-4 py-2 text-sm text-accent shadow-raised">Drop files to upload</p>
        </div>
      )}

      <FilePreviewDrawer
        file={previewFile}
        mode={mode}
        canWrite={canWrite}
        bucketPublic={bucket.isPublic}
        onClose={() => setPreviewId(null)}
        onRename={handleRename}
        onDelete={(id) => askDelete([id])}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={deleteIds.length === 1
          ? `Delete "${files.find((file) => file.id === deleteIds[0])?.name ?? "file"}"?`
          : `Delete ${deleteIds.length} files?`}
        description={mode === "live"
          ? "This permanently deletes the selected stored objects."
          : "This removes the selected files from this temporary demo session."}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void handleDeleteConfirmed()}
      />
    </div>
  );
}
