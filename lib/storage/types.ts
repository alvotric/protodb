export interface StorageBucket {
  id: string;
  name: string;
  displayName: string;
  isPublic: boolean;
  sizeLimitBytes: number | null;
  objectCount: number;
  usedBytes: number;
  createdAt: string;
  updatedAt: string;
}

export type StorageFileKind = "image" | "text" | "json" | "pdf" | "other";

export interface StorageObject {
  id: string;
  bucketId: string;
  name: string;
  folder: string;
  contentType: string;
  kind: StorageFileKind;
  sizeBytes: number;
  etag: string | null;
  checksum: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorageObjectPage {
  objects: StorageObject[];
  folders: string[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UploadReservation {
  id: string;
  bucketId: string;
  userId: string;
  storageKey: string;
  name: string;
  folder: string;
  contentType: string;
  declaredSize: number;
  expiresAt: string;
}
