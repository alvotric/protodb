import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { getPool, isDatabaseConfigured, query, queryOne } from "@/lib/db/client";
import { getStorageConfigurationStatus } from "@/lib/storage/config";
import { S3StorageProvider } from "@/lib/storage/s3-provider";
import {
  MAX_STORAGE_FILE_BYTES,
  MAX_STORAGE_IMAGE_PREVIEW_BYTES,
  MAX_STORAGE_PAGE_SIZE,
  MAX_STORAGE_PREVIEW_BYTES,
  UPLOAD_RESERVATION_TTL_MINUTES,
  UPLOAD_URL_TTL_SECONDS,
  StorageRequestError,
  canAccessPublicObject,
  getStorageKind,
  newStorageObjectKey,
  quotaExceeded,
  validateBucketName,
  validateContentType,
  validateDisplayName,
  validateFolderPath,
  parsePage,
  parsePageSize,
  validateUploadSize,
  validateUuid,
} from "@/lib/storage/policy";
import type { PresignedUpload, StorageProvider, VerifiedObjectMetadata } from "@/lib/storage/provider";
import type { StorageBucket, StorageObject, StorageObjectPage } from "@/lib/storage/types";

export class StorageServiceError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = "StorageServiceError";
  }
}

function provider(): StorageProvider {
  const status = getStorageConfigurationStatus();
  if (status.mode === "demo") throw new StorageServiceError("Storage provider is not configured.", 503);
  if (status.mode === "unavailable") throw new StorageServiceError(status.error, 503);
  const signature = JSON.stringify(status.configuration);
  if (!providerInstance || signature !== providerSignature) {
    providerInstance = new S3StorageProvider(status.configuration);
    providerSignature = signature;
  }
  return providerInstance;
}

let providerInstance: StorageProvider | null = null;
let providerSignature = "";

function requireDatabase(): void {
  if (!isDatabaseConfigured()) throw new StorageServiceError("Database is not configured.", 503);
}

async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let open = false;
  let released = false;
  try {
    await client.query("BEGIN");
    open = true;
    const result = await run(client);
    await client.query("COMMIT");
    open = false;
    return result;
  } catch (error) {
    if (open) {
      try {
        await client.query("ROLLBACK");
      } catch {
        client.release(new Error("Storage transaction rollback failed."));
        released = true;
        throw error;
      }
    }
    throw error;
  } finally {
    if (!released) client.release();
  }
}

function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.MAX_SAFE_INTEGER;
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

interface BucketRow extends QueryResultRow {
  id: string;
  name: string;
  display_name: string;
  is_public: boolean;
  size_limit_bytes: string | number | null;
  object_count: string | number;
  used_bytes: string | number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ObjectRow extends QueryResultRow {
  id: string;
  bucket_id: string;
  display_name: string;
  folder_path: string;
  content_type: string;
  size_bytes: string | number;
  etag: string | null;
  checksum: string | null;
  uploaded_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ReservationRow extends QueryResultRow {
  id: string;
  bucket_id: string;
  user_id: string;
  storage_key: string;
  display_name: string;
  folder_path: string;
  content_type: string;
  declared_size_bytes: string | number;
  status: "pending" | "finalizing" | "cleanup";
  expires_at: Date | string;
}

function toBucket(row: BucketRow): StorageBucket {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    isPublic: row.is_public,
    sizeLimitBytes: row.size_limit_bytes === null ? null : numeric(row.size_limit_bytes),
    objectCount: numeric(row.object_count),
    usedBytes: numeric(row.used_bytes),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toObject(row: ObjectRow): StorageObject {
  return {
    id: row.id,
    bucketId: row.bucket_id,
    name: row.display_name,
    folder: row.folder_path,
    contentType: row.content_type,
    kind: getStorageKind(row.display_name, row.content_type),
    sizeBytes: numeric(row.size_bytes),
    etag: row.etag,
    checksum: row.checksum,
    uploadedBy: row.uploaded_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const BUCKET_SELECT = `
  select b.id, b.name, b.display_name, b.is_public, b.size_limit_bytes,
         coalesce(stats.object_count, 0)::bigint as object_count,
         coalesce(stats.used_bytes, 0)::bigint as used_bytes,
         b.created_at, b.updated_at
  from protodb_admin.storage_buckets b
  left join lateral (
    select count(*) as object_count, coalesce(sum(o.size_bytes), 0) as used_bytes
    from protodb_admin.storage_objects o
    where o.bucket_id = b.id and o.state = 'ready'
  ) stats on true`;

async function findBucket(id: string, client?: PoolClient): Promise<BucketRow | null> {
  const statement = `${BUCKET_SELECT} where b.id = $1`;
  if (client) {
    const result = await client.query<BucketRow>(statement, [id]);
    return result.rows[0] ?? null;
  }
  return queryOne<BucketRow>(statement, [id]);
}

export async function checkStorageProvider(): Promise<void> {
  requireDatabase();
  try {
    await provider().healthCheck();
  } catch {
    throw new StorageServiceError("Storage provider is unavailable or the configured object bucket cannot be accessed.", 503);
  }
}

export async function listBuckets(): Promise<StorageBucket[]> {
  requireDatabase();
  const rows = await query<BucketRow>(`${BUCKET_SELECT} order by lower(b.display_name), b.id`);
  return rows.map(toBucket);
}

export async function createBucket(input: { name: unknown; displayName?: unknown }, userId: string): Promise<StorageBucket> {
  requireDatabase();
  const name = validateBucketName(input.name);
  const displayName = validateDisplayName(input.displayName ?? name);
  await checkStorageProvider();
  try {
    const rows = await query<BucketRow>(
      `insert into protodb_admin.storage_buckets (name, display_name, created_by)
       values ($1, $2, $3)
       returning id, name, display_name, is_public, size_limit_bytes, 0::bigint as object_count,
                 0::bigint as used_bytes, created_at, updated_at`,
      [name, displayName, userId]
    );
    return toBucket(rows[0]);
  } catch (error) {
    if (postgresCode(error) === "23505") throw new StorageServiceError("A bucket with this name already exists.", 409);
    throw error;
  }
}

export async function updateBucketSettings(
  idValue: unknown,
  settings: { isPublic: unknown; sizeLimitBytes: unknown }
): Promise<StorageBucket> {
  requireDatabase();
  const id = validateUuid(idValue, "Bucket ID");
  if (typeof settings.isPublic !== "boolean") throw new StorageRequestError("isPublic must be a boolean.");
  const limit = settings.sizeLimitBytes;
  if (limit !== null && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 0)) {
    throw new StorageRequestError("sizeLimitBytes must be null or a non-negative safe integer.");
  }

  return transaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [id]);
    const bucket = await findBucket(id, client);
    if (!bucket) throw new StorageServiceError("Bucket not found.", 404);
    const used = await client.query<{ used_bytes: string; reserved_bytes: string }>(
      `select
         coalesce((select sum(size_bytes) from protodb_admin.storage_objects where bucket_id = $1), 0)::text as used_bytes,
         coalesce((select sum(declared_size_bytes) from protodb_admin.storage_upload_reservations
                   where bucket_id = $1 and status in ('pending', 'finalizing') and expires_at > now()), 0)::text as reserved_bytes`,
      [id]
    );
    if (quotaExceeded(numeric(used.rows[0].used_bytes), numeric(used.rows[0].reserved_bytes), 0, limit)) {
      throw new StorageServiceError("The new size limit is below current usage and active upload reservations.", 409);
    }
    await client.query(
      `update protodb_admin.storage_buckets
       set is_public = $2, size_limit_bytes = $3, updated_at = now()
       where id = $1`,
      [id, settings.isPublic, limit]
    );
    const updated = await findBucket(id, client);
    if (!updated) throw new StorageServiceError("Bucket disappeared while updating settings.", 409);
    return toBucket(updated);
  });
}

export async function listObjects(input: {
  bucketId: unknown;
  folder: unknown;
  search: unknown;
  page: number;
  pageSize: number;
}): Promise<StorageObjectPage> {
  requireDatabase();
  const bucketId = validateUuid(input.bucketId, "Bucket ID");
  const folder = validateFolderPath(input.folder);
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 120) : "";
  const page = Number.isSafeInteger(input.page) && input.page >= 0 ? input.page : 0;
  const pageSize = Number.isSafeInteger(input.pageSize) && input.pageSize > 0
    ? Math.min(input.pageSize, MAX_STORAGE_PAGE_SIZE)
    : 50;
  if (!(await findBucket(bucketId))) throw new StorageServiceError("Bucket not found.", 404);

  const values: unknown[] = [bucketId, folder];
  let searchClause = "";
  if (search) {
    values.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
    searchClause = `and (display_name ilike $3 escape '\\' or folder_path ilike $3 escape '\\')`;
  }
  const totalResult = await query<{ count: string }>(
    `select count(*)::text as count from protodb_admin.storage_objects
     where bucket_id = $1 and folder_path = $2 and state = 'ready' ${searchClause}`,
    values
  );
  const foldersResult = await query<{ folder_name: string }>(
    `select distinct split_part(substring(folder_path from char_length($2) + 1), '/', 1) as folder_name
     from protodb_admin.storage_objects
     where bucket_id = $1 and state = 'ready' and folder_path <> ''
       and left(folder_path, char_length($2)) = $2
       and folder_path <> $2
     order by folder_name`,
    [bucketId, folder ? `${folder}/` : ""]
  );
  const offset = page * pageSize;
  if (!Number.isSafeInteger(offset)) throw new StorageRequestError("Page is out of range.");
  values.push(pageSize, offset);
  const rows = await query<ObjectRow>(
    `select id, bucket_id, display_name, folder_path, content_type, size_bytes,
            etag, checksum, uploaded_by, created_at, updated_at
     from protodb_admin.storage_objects
     where bucket_id = $1 and folder_path = $2 and state = 'ready' ${searchClause}
     order by lower(display_name), id
     limit $${values.length - 1} offset $${values.length}`,
    values
  );
  return {
    objects: rows.map(toObject),
    folders: foldersResult.map((row) => row.folder_name).filter(Boolean),
    page,
    pageSize,
    total: numeric(totalResult[0]?.count),
  };
}

export async function getObject(idValue: unknown): Promise<(StorageObject & { storageKey: string; bucketPublic: boolean }) | null> {
  requireDatabase();
  const id = validateUuid(idValue, "Object ID");
  const row = await queryOne<ObjectRow & QueryResultRow & { storage_key: string; is_public: boolean }>(
    `select o.id, o.bucket_id, o.display_name, o.folder_path, o.content_type, o.size_bytes,
            o.etag, o.checksum, o.uploaded_by, o.created_at, o.updated_at,
            o.storage_key, b.is_public
     from protodb_admin.storage_objects o
     join protodb_admin.storage_buckets b on b.id = o.bucket_id
     where o.id = $1 and o.state = 'ready'`,
    [id]
  );
  return row ? { ...toObject(row), storageKey: row.storage_key, bucketPublic: row.is_public } : null;
}

export async function initiateUpload(input: {
  bucketId: unknown;
  name: unknown;
  folder: unknown;
  contentType: unknown;
  sizeBytes: unknown;
}, userId: string): Promise<{ uploadId: string; upload: PresignedUpload; expiresAt: string }> {
  requireDatabase();
  const bucketId = validateUuid(input.bucketId, "Bucket ID");
  const name = validateDisplayName(input.name);
  const folder = validateFolderPath(input.folder);
  const contentType = validateContentType(input.contentType);
  const declaredSize = validateUploadSize(input.sizeBytes);
  const uploadId = randomUUID();
  const storageKey = newStorageObjectKey();
  const expiresAt = new Date(Date.now() + UPLOAD_RESERVATION_TTL_MINUTES * 60_000);

  await transaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [bucketId]);
    const bucket = await findBucket(bucketId, client);
    if (!bucket) throw new StorageServiceError("Bucket not found.", 404);
    const current = await client.query<{ used_bytes: string; reserved_bytes: string }>(
      `select
         coalesce((select sum(size_bytes) from protodb_admin.storage_objects where bucket_id = $1), 0)::text as used_bytes,
         coalesce((select sum(declared_size_bytes) from protodb_admin.storage_upload_reservations
                   where bucket_id = $1 and status in ('pending', 'finalizing') and expires_at > now()), 0)::text as reserved_bytes`,
      [bucketId]
    );
    if (quotaExceeded(
      numeric(current.rows[0].used_bytes),
      numeric(current.rows[0].reserved_bytes),
      declaredSize,
      bucket.size_limit_bytes === null ? null : numeric(bucket.size_limit_bytes)
    )) {
      throw new StorageServiceError("Upload would exceed this bucket's size limit.", 413);
    }
    await client.query(
      `insert into protodb_admin.storage_upload_reservations
         (id, bucket_id, user_id, storage_key, display_name, folder_path, content_type, declared_size_bytes, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [uploadId, bucketId, userId, storageKey, name, folder, contentType, declaredSize, expiresAt]
    );
  });

  try {
    const upload = await provider().createUpload({
      key: storageKey,
      uploadId,
      contentType,
      maxBytes: declaredSize,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    return { uploadId, upload, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    await query("delete from protodb_admin.storage_upload_reservations where id = $1 and user_id = $2", [uploadId, userId]);
    throw error;
  }
}

async function getReservation(id: string, userId: string, lock = false, client?: PoolClient): Promise<ReservationRow | null> {
  const statement = `select id, bucket_id, user_id, storage_key, display_name, folder_path,
                         content_type, declared_size_bytes, status, expires_at
                     from protodb_admin.storage_upload_reservations
                     where id = $1 and user_id = $2 ${lock ? "for update" : ""}`;
  if (client) {
    const result = await client.query<ReservationRow>(statement, [id, userId]);
    return result.rows[0] ?? null;
  }
  return queryOne<ReservationRow>(statement, [id, userId]);
}

export async function finalizeUpload(idValue: unknown, userId: string): Promise<StorageObject> {
  requireDatabase();
  const id = validateUuid(idValue, "Upload ID");
  const reservation = await transaction(async (client) => {
    const row = await getReservation(id, userId, true, client);
    if (!row) throw new StorageServiceError("Upload reservation not found.", 404);
    if (row.status === "cleanup") throw new StorageServiceError("Upload reservation is being cleaned up.", 409);
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new StorageServiceError("Upload reservation has expired.", 410);
    }
    await client.query(
      "update protodb_admin.storage_upload_reservations set status = 'finalizing' where id = $1",
      [id]
    );
    return row;
  });

  let metadata: VerifiedObjectMetadata | null;
  try {
    metadata = await provider().headObject(reservation.storage_key);
  } catch {
    throw new StorageServiceError("Could not verify uploaded object. Retry finalization or cancel the upload.", 502);
  }
  if (!metadata ||
      metadata.uploadId !== id ||
      metadata.sizeBytes !== numeric(reservation.declared_size_bytes) ||
      metadata.sizeBytes > MAX_STORAGE_FILE_BYTES ||
      metadata.contentType.toLowerCase() !== reservation.content_type.toLowerCase()) {
    try {
      await provider().deleteObject(reservation.storage_key);
      await query("delete from protodb_admin.storage_upload_reservations where id = $1", [id]);
    } catch {
      console.error("Could not clean up an invalid Storage upload.", { uploadId: id });
    }
    throw new StorageServiceError("Uploaded object failed verification and was not added to Storage.", 400);
  }

  try {
    return await transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [reservation.bucket_id]);
      const locked = await getReservation(id, userId, true, client);
      if (!locked || locked.status === "cleanup" || locked.storage_key !== reservation.storage_key) {
        throw new StorageServiceError("Upload reservation is no longer valid.", 409);
      }
      const bucket = await findBucket(reservation.bucket_id, client);
      if (!bucket) throw new StorageServiceError("Bucket not found.", 404);
      const used = await client.query<{ used_bytes: string }>(
        "select coalesce(sum(size_bytes), 0)::text as used_bytes from protodb_admin.storage_objects where bucket_id = $1",
        [reservation.bucket_id]
      );
      if (quotaExceeded(
        numeric(used.rows[0].used_bytes),
        0,
        metadata!.sizeBytes,
        bucket.size_limit_bytes === null ? null : numeric(bucket.size_limit_bytes)
      )) {
        throw new StorageServiceError("Upload would exceed this bucket's size limit.", 413);
      }
      const inserted = await client.query<ObjectRow>(
        `insert into protodb_admin.storage_objects
           (bucket_id, storage_key, display_name, folder_path, content_type, size_bytes, etag, checksum, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id, bucket_id, display_name, folder_path, content_type, size_bytes,
                   etag, checksum, uploaded_by, created_at, updated_at`,
        [
          reservation.bucket_id, reservation.storage_key, reservation.display_name, reservation.folder_path,
          metadata!.contentType, metadata!.sizeBytes, metadata!.etag, metadata!.checksum, userId,
        ]
      );
      await client.query("delete from protodb_admin.storage_upload_reservations where id = $1", [id]);
      return toObject(inserted.rows[0]);
    });
  } catch (error) {
    if (postgresCode(error) === "23505") {
      try {
        await provider().deleteObject(reservation.storage_key);
        await query("delete from protodb_admin.storage_upload_reservations where id = $1", [id]);
      } catch {
        console.error("Could not clean up a conflicting Storage upload.", { uploadId: id });
      }
      throw new StorageServiceError("A file with that name already exists in this folder.", 409);
    }
    throw error;
  }
}

export async function cancelUpload(idValue: unknown, userId: string): Promise<void> {
  requireDatabase();
  const id = validateUuid(idValue, "Upload ID");
  const row = await transaction(async (client) => {
    const reservation = await getReservation(id, userId, true, client);
    if (!reservation) throw new StorageServiceError("Upload reservation not found.", 404);
    await client.query(
      "update protodb_admin.storage_upload_reservations set status = 'cleanup', expires_at = now() where id = $1",
      [id]
    );
    return reservation;
  });
  await provider().deleteObject(row.storage_key);
  await query(
    "delete from protodb_admin.storage_upload_reservations where id = $1 and user_id = $2 and status = 'cleanup'",
    [id, userId]
  );
}

export async function createDownloadUrl(idValue: unknown, inline = false): Promise<{ url: string; name: string }> {
  const object = await getObject(idValue);
  if (!object) throw new StorageServiceError("Object not found.", 404);
  return {
    url: await provider().createDownloadUrl({
      key: object.storageKey,
      fileName: object.name,
      contentType: object.contentType,
      inline,
      expiresInSeconds: 60,
    }),
    name: object.name,
  };
}

export async function readObjectPreview(idValue: unknown): Promise<{
  object: StorageObject;
  bytes?: Uint8Array;
  contentType?: string;
  partial?: boolean;
}> {
  const object = await getObject(idValue);
  if (!object) throw new StorageServiceError("Object not found.", 404);
  const kind = getStorageKind(object.name, object.contentType);
  if (kind === "image") {
    if (!/^image\/(?:png|jpeg|gif|webp|avif|bmp)$/.test(object.contentType)) {
      throw new StorageServiceError("Preview is not supported for this image type.", 415);
    }
    if (object.sizeBytes > MAX_STORAGE_IMAGE_PREVIEW_BYTES) {
      throw new StorageServiceError("Image is too large to preview safely; download it instead.", 413);
    }
    const bytes = await provider().readPreview(object.storageKey, MAX_STORAGE_IMAGE_PREVIEW_BYTES);
    if (!bytes) throw new StorageServiceError("Object not found in the storage provider.", 404);
    return { object, bytes, contentType: object.contentType };
  }
  if (kind !== "text" && kind !== "json") {
    throw new StorageServiceError("Preview is not supported for this file type.", 415);
  }
  if (object.sizeBytes > MAX_STORAGE_PREVIEW_BYTES) {
    throw new StorageServiceError("Text preview is limited to 256 KB; download the file instead.", 413);
  }
  const bytes = await provider().readPreview(object.storageKey, MAX_STORAGE_PREVIEW_BYTES);
  if (!bytes) throw new StorageServiceError("Object not found in the storage provider.", 404);
  return { object, bytes, contentType: "text/plain; charset=utf-8", partial: object.sizeBytes > bytes.byteLength };
}

export async function renameObject(idValue: unknown, nameValue: unknown, folderValue: unknown): Promise<StorageObject> {
  requireDatabase();
  const id = validateUuid(idValue, "Object ID");
  const name = validateDisplayName(nameValue);
  const folder = validateFolderPath(folderValue);
  try {
    const rows = await query<ObjectRow>(
      `update protodb_admin.storage_objects
       set display_name = $2, folder_path = $3, updated_at = now()
       where id = $1 and state = 'ready'
       returning id, bucket_id, display_name, folder_path, content_type, size_bytes,
                 etag, checksum, uploaded_by, created_at, updated_at`,
      [id, name, folder]
    );
    if (!rows[0]) throw new StorageServiceError("Object not found.", 404);
    return toObject(rows[0]);
  } catch (error) {
    if (error instanceof StorageServiceError) throw error;
    if (postgresCode(error) === "23505") throw new StorageServiceError("A file with that name already exists in this folder.", 409);
    throw error;
  }
}

export async function deleteObjects(idValues: unknown): Promise<{ deleted: string[]; failed: string[] }> {
  requireDatabase();
  if (!Array.isArray(idValues) || idValues.length === 0 || idValues.length > 100) {
    throw new StorageRequestError("Provide between 1 and 100 object IDs.");
  }
  const ids = [...new Set(idValues.map((value) => validateUuid(value, "Object ID")))];
  const rows = await query<ObjectRow & { storage_key: string }>(
    `select id, bucket_id, display_name, folder_path, content_type, size_bytes,
            etag, checksum, uploaded_by, created_at, updated_at, storage_key
     from protodb_admin.storage_objects where id = any($1::uuid[])`,
    [ids]
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      failed.push(id);
      continue;
    }
    try {
      await query(
        "update protodb_admin.storage_objects set state = 'deleting', updated_at = now() where id = $1 and state in ('ready', 'deleting')",
        [id]
      );
      await provider().deleteObject(row.storage_key);
      const removed = await query("delete from protodb_admin.storage_objects where id = $1 returning id", [id]);
      if (removed.length) deleted.push(id);
      else failed.push(id);
    } catch (error) {
      console.error("Storage object deletion failed; it remains queued for retry.", { objectId: id, error });
      failed.push(id);
    }
  }
  return { deleted, failed };
}

export async function getPublicDownloadUrl(idValue: unknown): Promise<string> {
  const object = await getObject(idValue);
  if (!object) throw new StorageServiceError("Object not found.", 404);
  if (!canAccessPublicObject(object.bucketPublic)) throw new StorageServiceError("This object is not publicly accessible.", 404);
  return provider().createDownloadUrl({
    key: object.storageKey,
    fileName: object.name,
    contentType: object.contentType,
    inline: false,
    expiresInSeconds: 60,
  });
}

export async function cleanExpiredUploads(limit = 20): Promise<void> {
  requireDatabase();
  const reservations = await transaction(async (client) => {
    const selected = await client.query<ReservationRow>(
      `select id, bucket_id, user_id, storage_key, display_name, folder_path,
             content_type, declared_size_bytes, status, expires_at
       from protodb_admin.storage_upload_reservations
       where expires_at <= now() and status in ('pending', 'finalizing', 'cleanup')
       order by expires_at
       limit $1
       for update skip locked`,
      [limit]
    );
    if (selected.rows.length) {
      await client.query(
        "update protodb_admin.storage_upload_reservations set status = 'cleanup' where id = any($1::uuid[])",
        [selected.rows.map((row) => row.id)]
      );
    }
    return selected.rows;
  });
  for (const reservation of reservations) {
    try {
      await provider().deleteObject(reservation.storage_key);
      await query("delete from protodb_admin.storage_upload_reservations where id = $1 and status = 'cleanup'", [reservation.id]);
    } catch {
      console.error("Failed to clean up an expired Storage upload reservation.", { uploadId: reservation.id });
    }
  }
}

export async function cleanDeletingObjects(limit = 20): Promise<void> {
  requireDatabase();
  const objects = await transaction(async (client) => {
    const selected = await client.query<{ id: string; storage_key: string }>(
      `select id, storage_key
       from protodb_admin.storage_objects
       where state = 'deleting' and updated_at <= now() - interval '5 minutes'
       order by updated_at
       limit $1
       for update skip locked`,
      [limit]
    );
    if (selected.rows.length) {
      await client.query(
        "update protodb_admin.storage_objects set updated_at = now() where id = any($1::uuid[])",
        [selected.rows.map((object) => object.id)]
      );
    }
    return selected.rows;
  });
  for (const object of objects) {
    try {
      await provider().deleteObject(object.storage_key);
      await query("delete from protodb_admin.storage_objects where id = $1 and state = 'deleting'", [object.id]);
    } catch {
      console.error("Failed to clean up a Storage object after an incomplete deletion.", { objectId: object.id });
    }
  }
}

export async function getAuthorizedObjectMetadata(id: unknown): Promise<StorageObject | null> {
  const object = await getObject(id);
  if (!object) return null;
  return {
    id: object.id,
    bucketId: object.bucketId,
    name: object.name,
    folder: object.folder,
    contentType: object.contentType,
    kind: object.kind,
    sizeBytes: object.sizeBytes,
    etag: object.etag,
    checksum: object.checksum,
    uploadedBy: object.uploadedBy,
    createdAt: object.createdAt,
    updatedAt: object.updatedAt,
  };
}

export function parseStoragePage(value: string | null): number {
  return parsePage(value);
}

export function parseStoragePageSize(value: string | null): number {
  return parsePageSize(value);
}

function postgresCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
}
