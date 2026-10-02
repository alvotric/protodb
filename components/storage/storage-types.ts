import type { StorageFileKind } from "@/lib/storage/types";

export type FileKind = StorageFileKind;

export interface StorageFile {
  id: string;
  bucketId?: string;
  name: string;
  folder: string;
  kind: FileKind;
  sizeBytes: number;
  modifiedAt: string;
  contentType?: string;
  etag?: string | null;
  checksum?: string | null;
  content?: string;
  objectUrl?: string;
  sourceFile?: File;
  isUpload?: boolean;
}

export function detectKind(file: File): FileKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "application/json" || file.name.endsWith(".json")) return "json";
  if (file.type.startsWith("text/") || /\.(md|txt|csv|log)$/i.test(file.name)) return "text";
  return "other";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
