export type FileKind = "image" | "text" | "json" | "pdf" | "other";

export interface StorageFile {
  id: string;
  name: string;
  folder: string;
  kind: FileKind;
  sizeBytes: number;
  modifiedAt: string;
  /** Real text content -- present for seed text/json files and for any real uploaded text-like file (read via FileReader). */
  content?: string;
  /** Real blob URL (URL.createObjectURL) -- present for real uploaded files, so images get a genuine thumbnail/preview instead of a placeholder. */
  objectUrl?: string;
  /** The actual File object for a real upload, kept so Download can hand back the exact original bytes. */
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
