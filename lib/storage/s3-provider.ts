import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageConfiguration } from "./config";
import type { PresignedUpload, StorageProvider, VerifiedObjectMetadata } from "./provider";

/**
 * S3-compatible object backend behind the `StorageProvider` abstraction.
 * Application code must depend on the interface, never on this class or
 * on provider-specific details: the same implementation talks to AWS S3,
 * Cloudflare R2, Backblaze B2, or a local S3 emulator purely through
 * endpoint/region/credential configuration. Bytes live here; PostgreSQL
 * remains the metadata/control plane (buckets, objects, reservations,
 * quota, audit) and is never used for binary storage.
 */

export function encodeStorageFilename(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

const POST_FORM_OVERHEAD_BYTES = 64 * 1024;

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly configuration: StorageConfiguration;

  constructor(configuration: StorageConfiguration) {
    this.configuration = configuration;
    this.client = new S3Client({
      region: configuration.region,
      ...(configuration.endpoint ? { endpoint: configuration.endpoint } : {}),
      forcePathStyle: configuration.forcePathStyle,
      ...(configuration.accessKeyId && configuration.secretAccessKey
        ? { credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey } }
        : {}),
    });
  }

  async healthCheck(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.configuration.bucket }));
  }

  async createUpload(input: {
    key: string;
    uploadId: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    const upload = await createPresignedPost(this.client, {
      Bucket: this.configuration.bucket,
      Key: input.key,
      Expires: input.expiresInSeconds,
      Fields: {
        "Content-Type": input.contentType,
        "x-amz-meta-upload-id": input.uploadId,
      },
      Conditions: [
        ["content-length-range", 0, input.maxBytes + POST_FORM_OVERHEAD_BYTES],
        ["eq", "$Content-Type", input.contentType],
        ["eq", "$x-amz-meta-upload-id", input.uploadId],
      ],
    });
    return { ...upload, expiresInSeconds: input.expiresInSeconds };
  }

  async headObject(key: string): Promise<VerifiedObjectMetadata | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.configuration.bucket,
        Key: key,
      }));
      return {
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType ?? "application/octet-stream",
        etag: result.ETag ?? null,
        checksum: result.ChecksumSHA256 ?? result.ChecksumCRC32C ?? result.ChecksumCRC32 ?? null,
        uploadId: result.Metadata?.["upload-id"] ?? null,
      };
    } catch (error) {
      if (typeof error === "object" && error !== null && "$metadata" in error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404) return null;
      }
      throw error;
    }
  }

  async createDownloadUrl(input: {
    key: string;
    fileName: string;
    contentType: string;
    inline: boolean;
    expiresInSeconds: number;
  }): Promise<string> {
    const encodedName = encodeStorageFilename(input.fileName);
    const command = new GetObjectCommand({
      Bucket: this.configuration.bucket,
      Key: input.key,
      ResponseContentDisposition: `${input.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      ResponseContentType: input.contentType,
      ResponseCacheControl: "private, no-store",
    });
    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
  }

  async readPreview(key: string, maxBytes: number): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.configuration.bucket,
        Key: key,
        Range: `bytes=0-${Math.max(0, maxBytes - 1)}`,
      }));
      if (!result.Body) return null;
      return await result.Body.transformToByteArray();
    } catch (error) {
      if (typeof error === "object" && error !== null && "$metadata" in error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 || status === 416) return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.configuration.bucket,
      Key: key,
    }));
  }
}
