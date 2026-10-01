import { FileImage, FileText, FileJson, File as FileGeneric, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileKind } from "@/components/storage/storage-types";

const KIND_META: Record<FileKind, { icon: typeof FileText; className: string }> = {
  image: { icon: FileImage, className: "text-accent bg-accent-soft" },
  text: { icon: FileText, className: "text-ink-muted bg-surface-hover" },
  json: { icon: FileJson, className: "text-warning bg-warning-soft" },
  pdf: { icon: FileGeneric, className: "text-danger bg-danger-soft" },
  other: { icon: FileGeneric, className: "text-ink-faint bg-surface-hover" },
};

/**
 * Phase 7 — Storage Management.
 * `objectUrl` (a real `URL.createObjectURL(file)`) only ever exists
 * for something the user actually dropped in this session -- when
 * it's there for an image, this shows the genuine file, not a
 * placeholder. Seed mock image entries have no real bytes anywhere,
 * so they always get the generic icon rather than a fabricated photo.
 */
export function FileThumb({
  kind,
  objectUrl,
  size = "md",
  isFolder,
}: {
  kind: FileKind;
  objectUrl?: string;
  size?: "sm" | "md" | "lg";
  isFolder?: boolean;
}) {
  const dims = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-16 w-16" : "h-10 w-10";
  const iconSize = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";

  if (isFolder) {
    return (
      <div className={cn("flex shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent", dims)}>
        <Folder className={iconSize} />
      </div>
    );
  }

  if (kind === "image" && objectUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={objectUrl} alt="" className={cn("shrink-0 rounded-lg object-cover", dims)} />
    );
  }

  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-lg", meta.className, dims)}>
      <Icon className={iconSize} />
    </div>
  );
}
