"use client";

import { useEffect, useState } from "react";
import { Download, Trash2, Pencil, Check, X, Loader2, Share2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileThumb } from "@/components/storage/file-icon";
import { formatBytes, type StorageFile } from "@/components/storage/storage-types";
import type { StorageMode } from "@/components/storage/storage-workspace";

interface PreviewState {
  text?: string;
  imageUrl?: string;
  truncated: boolean;
  error?: string;
}

async function responseError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : `Request failed (${response.status}).`;
}

export function FilePreviewDrawer({
  file,
  mode,
  canWrite,
  bucketPublic,
  onClose,
  onRename,
  onDelete,
}: {
  file: StorageFile | null;
  mode: StorageMode;
  canWrite: boolean;
  bucketPublic: boolean;
  onClose: () => void;
  onRename: (id: string, name: string, folder: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);

  useEffect(() => {
    setRenaming(false);
    setRenameError(null);
    setPreview(null);
    setPublicLinkCopied(false);
    if (!file) return;
    setDraftName(file.name);
    if (mode === "demo") {
      setPreview({
        ...(file.content !== undefined ? { text: file.content } : {}),
        ...(file.objectUrl ? { imageUrl: file.objectUrl } : {}),
        ...(!file.content && file.kind === "image" && !file.objectUrl
          ? { error: "This demo sample has no image bytes to preview." }
          : {}),
        truncated: false,
      });
      return;
    }

    const controller = new AbortController();
    let imageUrl: string | null = null;
    fetch(`/api/storage/objects/${encodeURIComponent(file.id)}/preview`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        const truncated = response.headers.get("x-preview-truncated") === "true";
        if (file.kind === "image") {
          const blob = await response.blob();
          imageUrl = URL.createObjectURL(blob);
          setPreview({ imageUrl, truncated: false });
        } else {
          setPreview({ text: await response.text(), truncated });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setPreview({ truncated: false, error: error instanceof Error ? error.message : "Preview could not be loaded." });
      });
    return () => {
      controller.abort();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [file, mode]);

  if (!file) return null;

  const canDownload = mode === "live" || Boolean(file.sourceFile || file.content !== undefined);

  async function handleDownload() {
    if (!file || downloading || !canDownload) return;
    setDownloading(true);
    setRenameError(null);
    try {
      if (mode === "live") {
        const response = await fetch(`/api/storage/objects/${encodeURIComponent(file.id)}/download`);
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string") {
          throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : `Download request failed (${response.status}).`);
        }
        window.location.assign(body.url);
        return;
      }

      const blob = file.sourceFile ?? new Blob([file.content ?? ""], { type: file.contentType ?? "text/plain" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyPublicLink() {
    if (!file || mode !== "live" || !bucketPublic) return;
    const url = new URL(`/api/storage/public/${encodeURIComponent(file.id)}`, window.location.origin);
    try {
      await navigator.clipboard.writeText(url.toString());
      setPublicLinkCopied(true);
    } catch {
      setRenameError("Could not copy the public link. Check clipboard permissions and try again.");
    }
  }

  async function commitRename() {
    if (!file || savingName) return;
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === file.name) {
      setRenaming(false);
      return;
    }
    setSavingName(true);
    setRenameError(null);
    try {
      await onRename(file.id, trimmed, file.folder);
      setRenaming(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Could not rename file.");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <Drawer open={file !== null} onClose={onClose} title="File details">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6">
        <FileThumb kind={file.kind} objectUrl={preview?.imageUrl ?? file.objectUrl} size="lg" />
        {renaming ? (
          <div className="flex w-full items-center gap-1.5">
            <Input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void commitRename();
                if (event.key === "Escape") setRenaming(false);
              }}
              autoFocus
              className="text-center"
              disabled={savingName}
            />
            <button onClick={() => void commitRename()} disabled={savingName} aria-label="Save new filename" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-success hover:bg-success-soft disabled:opacity-50">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => setRenaming(false)} disabled={savingName} aria-label="Cancel rename" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-hover disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="group flex items-center gap-1.5">
            <span className="break-all text-center font-mono text-sm text-ink">{file.name}</span>
            {canWrite && (
              <button onClick={() => { setRenameError(null); setRenaming(true); }} aria-label="Rename file" className="text-ink-faint opacity-0 hover:text-ink group-hover:opacity-100">
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-ink-faint">
          {formatBytes(file.sizeBytes)} · {new Date(file.modifiedAt).toLocaleString()}
        </p>
      </div>

      {(file.kind === "text" || file.kind === "json" || file.kind === "image") && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Preview</p>
          {preview === null ? (
            <p className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3 text-xs text-ink-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading preview…
            </p>
          ) : preview.error ? (
            <p role="status" className="rounded-lg border border-border bg-surface p-3 text-xs text-ink-faint">{preview.error}</p>
          ) : preview.text !== undefined ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-canvas p-3 font-mono text-[12px] leading-5 text-ink-muted">
              {preview.text}
            </pre>
          ) : file.kind === "image" && preview.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.imageUrl} alt={file.name} className="max-h-80 max-w-full rounded-lg object-contain" />
          ) : null}
          {preview?.truncated && <p className="mt-1 text-[11px] text-warning">Showing only the first 256 KB.</p>}
        </div>
      )}

      {mode === "demo" && !canDownload && (
        <p className="mt-4 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs text-ink-faint">
          This sample entry has no file bytes. Add a file in this demo session to preview or download its actual browser-selected content.
        </p>
      )}

      {renameError && <p role="alert" className="mt-3 text-xs text-danger">{renameError}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button size="sm" variant="secondary" onClick={() => void handleDownload()} disabled={!canDownload || downloading} loading={downloading} className="flex-1">
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
        {mode === "live" && bucketPublic && (
          <Button size="sm" variant="secondary" onClick={() => void handleCopyPublicLink()}>
            {publicLinkCopied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            {publicLinkCopied ? "Copied" : "Copy public link"}
          </Button>
        )}
        {canWrite && (
          <Button size="sm" variant="danger" onClick={() => onDelete(file.id)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
      </div>
    </Drawer>
  );
}
