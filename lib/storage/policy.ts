import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth/session";
import type { StorageFileKind } from "@/lib/storage/types";

export const MAX_STORAGE_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_STORAGE_PAGE_SIZE = 100;
export const MAX_STORAGE_PREVIEW_BYTES = 256 * 1024;
export const MAX_STORAGE_IMAGE_PREVIEW_BYTES = 5 * 1024 * 1024;
export const UPLOAD_URL_TTL_SECONDS = 300;
export const UPLOAD_RESERVATION_TTL_MINUTES = 30;

export class StorageRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StorageRequestError";
    this.status = status;
  }
}

export function validateBucketName(value: unknown): string {
  if (typeof value !== "string") throw new StorageRequestError("Bucket name must be a string.");
  const name = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(name)) {
    throw new StorageRequestError("Bucket name must be 3–63 lowercase letters, numbers, or hyphens and start/end with a letter or number.");
  }
  return name;
}

export function validateDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new StorageRequestError("Display name must be a string.");
  const name = value.trim();
  if (!name || name === "." || name === ".." || /[/\\\u0000-\u001f\u007f]/.test(name)) {
    throw new StorageRequestError("Display name is empty or contains an invalid path character.");
  }
  if (Buffer.byteLength(name, "utf8") > 255) {
    throw new StorageRequestError("Display name must not exceed 255 UTF-8 bytes.");
  }
  return name;
}

export function validateFolderPath(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.startsWith("/") || value.startsWith("\\") || value.includes("\\")) {
    throw new StorageRequestError("Folder must be a relative slash-separated path.");
  }
  if (Buffer.byteLength(value, "utf8") > 512) throw new StorageRequestError("Folder path is too long.");
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\u0000-\u001f\u007f]/.test(part))) {
    throw new StorageRequestError("Folder path contains an invalid or traversal segment.");
  }
  return parts.join("/");
}

export function validateContentType(value: unknown): string {
  if (value === undefined || value === null || value === "") return "application/octet-stream";
  if (typeof value !== "string" || value.length > 255 ||
      !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;\s*charset=[a-z0-9_-]+)?$/i.test(value)) {
    throw new StorageRequestError("Content type is invalid.");
  }
  return value.toLowerCase();
}

export function validateUploadSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new StorageRequestError("File size must be a non-negative safe integer.");
  }
  if (value > MAX_STORAGE_FILE_BYTES) {
    throw new StorageRequestError(`Files must not exceed ${MAX_STORAGE_FILE_BYTES / 1024 / 1024} MB.`);
  }
  return value;
}

export function validateUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new StorageRequestError(`${label} is invalid.`);
  }
  return value;
}

export function parsePage(value: string | null): number {
  if (value === null) return 0;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 0 || page > 100_000) {
    throw new StorageRequestError("Page must be a non-negative integer no greater than 100000.");
  }
  return page;
}

export function parsePageSize(value: string | null): number {
  if (value === null) return 50;
  const pageSize = Number(value);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new StorageRequestError("Page size must be a positive integer.");
  return Math.min(pageSize, MAX_STORAGE_PAGE_SIZE);
}

export function getStorageKind(name: string, contentType: string): StorageFileKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/json" || name.toLowerCase().endsWith(".json")) return "json";
  if (contentType.startsWith("text/") || /\.(md|txt|csv|log)$/i.test(name)) return "text";
  if (contentType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "other";
}

export function canReadStorage(_user: SessionUser): boolean {
  return _user.status === "active";
}

export function canWriteStorage(user: SessionUser): boolean {
  return user.status === "active" && (user.role === "Owner" || user.role === "Admin" || user.role === "Editor");
}

export function canManageStorage(user: SessionUser): boolean {
  return user.status === "active" && (user.role === "Owner" || user.role === "Admin");
}

export function quotaExceeded(usedBytes: number, reservedBytes: number, requestedBytes: number, limitBytes: number | null): boolean {
  return limitBytes !== null && usedBytes + reservedBytes + requestedBytes > limitBytes;
}

export function canAccessPublicObject(isBucketPublic: boolean): boolean {
  return isBucketPublic;
}

export function newStorageObjectKey(): string {
  return `objects/${randomUUID()}`;
}
