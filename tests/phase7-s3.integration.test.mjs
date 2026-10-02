import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const enabled = process.env.STORAGE_TEST_DISPOSABLE === "true";

test("S3-compatible adapter loads in a server runtime", async () => {
  const { S3StorageProvider } = await import("../lib/storage/s3-provider.ts");
  assert.equal(typeof S3StorageProvider, "function");
});

test("S3-compatible provider upload, verify, download, preview, and delete lifecycle", {
  skip: !enabled,
}, async () => {
  const endpoint = process.env.STORAGE_TEST_ENDPOINT;
  const bucket = process.env.STORAGE_TEST_BUCKET;
  const accessKeyId = process.env.STORAGE_TEST_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_TEST_SECRET_ACCESS_KEY;
  assert.ok(endpoint && bucket && accessKeyId && secretAccessKey,
    "Set all STORAGE_TEST_* values when STORAGE_TEST_DISPOSABLE=true.");
  assert.match(bucket, /test/i, "Use a dedicated disposable bucket with 'test' in its name.");
  const parsedEndpoint = new URL(endpoint);
  assert.ok(["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsedEndpoint.hostname),
    "Integration tests are restricted to a loopback storage endpoint.");
  assert.equal(parsedEndpoint.protocol, "http:", "Use an explicitly local HTTP endpoint for disposable MinIO.");

  const { S3StorageProvider } = await import("../lib/storage/s3-provider.ts");
  const provider = new S3StorageProvider({
    provider: "s3",
    bucket,
    region: process.env.STORAGE_TEST_REGION || "us-east-1",
    endpoint,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: true,
  });
  const key = `phase7-integration/${randomUUID()}`;
  const uploadId = randomUUID();
  const bytes = new TextEncoder().encode("phase 7 storage integration");

  try {
    await provider.healthCheck();
    const upload = await provider.createUpload({
      key,
      uploadId,
      contentType: "text/plain",
      maxBytes: bytes.byteLength,
      expiresInSeconds: 60,
    });
    const form = new FormData();
    for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
    form.append("file", new Blob([bytes], { type: "text/plain" }), "integration.txt");
    const response = await fetch(upload.url, { method: "POST", body: form });
    assert.equal(response.ok, true, `Object storage rejected upload (${response.status}).`);

    const metadata = await provider.headObject(key);
    assert.equal(metadata?.sizeBytes, bytes.byteLength);
    assert.equal(metadata?.contentType, "text/plain");
    assert.equal(metadata?.uploadId, uploadId);

    const downloadUrl = await provider.createDownloadUrl({
      key,
      fileName: "integration test.txt",
      contentType: "text/plain",
      inline: false,
      expiresInSeconds: 60,
    });
    const downloaded = await fetch(downloadUrl);
    assert.equal(downloaded.ok, true);
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), bytes);
    assert.deepEqual(await provider.readPreview(key, bytes.byteLength), bytes);
  } finally {
    await provider.deleteObject(key);
  }
  assert.equal(await provider.headObject(key), null);
});
