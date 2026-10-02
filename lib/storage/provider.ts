export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  expiresInSeconds: number;
}

export interface VerifiedObjectMetadata {
  sizeBytes: number;
  contentType: string;
  etag: string | null;
  checksum: string | null;
  uploadId: string | null;
}

export interface StorageProvider {
  healthCheck(): Promise<void>;
  createUpload(input: {
    key: string;
    uploadId: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload>;
  headObject(key: string): Promise<VerifiedObjectMetadata | null>;
  createDownloadUrl(input: {
    key: string;
    fileName: string;
    contentType: string;
    inline: boolean;
    expiresInSeconds: number;
  }): Promise<string>;
  readPreview(key: string, maxBytes: number): Promise<Uint8Array | null>;
  deleteObject(key: string): Promise<void>;
}
