import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessPublicObject,
  canManageStorage,
  canReadStorage,
  canWriteStorage,
  getStorageKind,
  MAX_STORAGE_FILE_BYTES,
  MAX_STORAGE_FOLDER_DEPTH,
  newStorageObjectKey,
  parsePage,
  parsePageSize,
  quotaExceeded,
  validateBucketName,
  validateContentType,
  validateDisplayName,
  validateFolderPath,
  validateUploadSize,
  validateUuid,
} from "../lib/storage/policy.ts";
import {
  assertGlobalScope,
  GLOBAL_STORAGE_SCOPE,
  resolveStorageScope,
  scopeAuditLabel,
} from "../lib/storage/scope.ts";
import { getStorageConfigurationStatus } from "../lib/storage/config.ts";
import { encodeStorageFilename } from "../lib/storage/s3-provider.ts";

function user(role, status = "active") {
  return { id: "user-id", email: "user@example.test", name: "User", role, status };
}

test("storage policy enforces active status and intended role capabilities", () => {
  assert.equal(canReadStorage(user("Viewer")), true);
  assert.equal(canReadStorage(user("Editor")), true);
  assert.equal(canWriteStorage(user("Editor")), true);
  assert.equal(canWriteStorage(user("Admin")), true);
  assert.equal(canManageStorage(user("Admin")), true);
  assert.equal(canManageStorage(user("Owner")), true);
  assert.equal(canWriteStorage(user("Viewer")), false);
  assert.equal(canManageStorage(user("Editor")), false);
  assert.equal(canReadStorage(user("Owner", "invited")), false);
  assert.equal(canWriteStorage(user("Owner", "suspended")), false);
  assert.equal(canManageStorage(user("Admin", "suspended")), false);
});

test("public object access is controlled by persisted bucket visibility", () => {
  assert.equal(canAccessPublicObject(true), true);
  assert.equal(canAccessPublicObject(false), false);
});

test("storage identifiers, names, folders, MIME types, and upload sizes are validated", () => {
  assert.equal(validateBucketName("files-2026"), "files-2026");
  assert.throws(() => validateBucketName("x"), /3–63/);
  assert.equal(validateDisplayName("report final.txt"), "report final.txt");
  assert.throws(() => validateDisplayName("  "), /empty/);
  assert.throws(() => validateDisplayName("../secrets"), /path character/);
  assert.equal(validateFolderPath("reports/2026"), "reports/2026");
  assert.equal(validateFolderPath(undefined), "");
  assert.throws(() => validateFolderPath("reports/../private"), /traversal/);
  assert.equal(validateContentType("text/plain"), "text/plain");
  assert.equal(validateContentType(undefined), "application/octet-stream");
  assert.throws(() => validateContentType("text/plain\r\nx: unsafe"), /invalid/);
  assert.equal(validateUploadSize(MAX_STORAGE_FILE_BYTES), MAX_STORAGE_FILE_BYTES);
  assert.throws(() => validateUploadSize(MAX_STORAGE_FILE_BYTES + 1), /must not exceed/);
  assert.throws(() => validateUploadSize("false"), /non-negative safe integer/);
  assert.equal(validateUuid("123e4567-e89b-42d3-a456-426614174000", "Object ID"),
    "123e4567-e89b-42d3-a456-426614174000");
  assert.throws(() => validateUuid("not-an-id", "Object ID"), /is invalid/);
  assert.equal(parsePage("12"), 12);
  assert.throws(() => parsePage("-1"), /non-negative integer/);
  assert.equal(parsePageSize("500"), 100);
  assert.throws(() => parsePageSize("0"), /positive integer/);
});

test("storage metadata classification, quota, object keys, and download filenames are safe", () => {
  assert.equal(getStorageKind("summary.md", "application/octet-stream"), "text");
  assert.equal(getStorageKind("image.png", "image/png"), "image");
  assert.equal(quotaExceeded(80, 10, 11, 100), true);
  assert.equal(quotaExceeded(80, 10, 10, 100), false);
  assert.equal(quotaExceeded(80, 10, 10, null), false);
  assert.match(newStorageObjectKey(), /^objects\/[0-9a-f-]{36}$/i);
  assert.equal(encodeStorageFilename("a b!*'()"), "a%20b%21%2A%27%28%29");
});

test("storage configuration accepts only secure remote endpoints or loopback HTTP", () => {
  const keys = [
    "STORAGE_PROVIDER",
    "S3_BUCKET",
    "S3_REGION",
    "S3_ENDPOINT",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_FORCE_PATH_STYLE",
  ];
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  function clearConfiguration() {
    for (const key of keys) delete process.env[key];
  }
  function configure(endpoint) {
    process.env.STORAGE_PROVIDER = "s3";
    process.env.S3_BUCKET = "protodb-test";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = endpoint;
    process.env.S3_ACCESS_KEY_ID = "test-access-key";
    process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.S3_FORCE_PATH_STYLE = "true";
    return getStorageConfigurationStatus();
  }
  try {
    clearConfiguration();
    assert.equal(getStorageConfigurationStatus().mode, "demo");
    process.env.S3_FORCE_PATH_STYLE = "true";
    assert.equal(getStorageConfigurationStatus().mode, "unavailable");
    assert.equal(configure("http://127.0.0.1:9000").mode, "live");
    assert.equal(configure("https://storage.example.test").mode, "live");
    assert.equal(configure("http://storage.example.test").mode, "unavailable");
    process.env.STORAGE_PROVIDER = "s3";
    process.env.S3_BUCKET = "protodb-test";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "";
    process.env.S3_ACCESS_KEY_ID = "";
    process.env.S3_SECRET_ACCESS_KEY = "";
    process.env.S3_FORCE_PATH_STYLE = "sometimes";
    assert.equal(getStorageConfigurationStatus().mode, "unavailable");
    assert.equal(configure("https://user:pass@storage.example.test").mode, "unavailable");
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("storage validators reject encoded traversal, lone surrogates, and excessive depth", () => {
  assert.throws(() => validateDisplayName("report%2fsecret.txt"), /encoded path traversal/);
  assert.throws(() => validateDisplayName("a%2E%2Esecret"), /encoded path traversal/);
  assert.throws(() => validateDisplayName("name%5cadmin"), /encoded path traversal/);
  assert.throws(() => validateDisplayName("bad\ud800name"), /invalid Unicode/);
  assert.throws(() => validateFolderPath("reports/%2e%2e/private"), /invalid or encoded/);
  assert.throws(() => validateFolderPath("lone\udc00/segment"), /invalid or encoded/);
  const deep = Array.from({ length: MAX_STORAGE_FOLDER_DEPTH + 1 }, (_, i) => `level${i}`).join("/");
  assert.throws(() => validateFolderPath(deep), /must not exceed/);
  const maxDepth = Array.from({ length: MAX_STORAGE_FOLDER_DEPTH }, (_, i) => `level${i}`).join("/");
  assert.equal(validateFolderPath(maxDepth), maxDepth);
  assert.equal(validateDisplayName("invoice 100%.pdf"), "invoice 100%.pdf");
  assert.equal(validateFolderPath("reports/2026"), "reports/2026");
});

test("storage scope defaults to the shared global scope with explicit non-global refusal", () => {
  assert.deepEqual(resolveStorageScope({ userId: "user-id" }), GLOBAL_STORAGE_SCOPE);
  assert.equal(scopeAuditLabel(GLOBAL_STORAGE_SCOPE), "global");
  assert.equal(
    scopeAuditLabel({ kind: "workspace", workspaceId: "ws-1" }),
    "workspace:ws-1"
  );
  assertGlobalScope(GLOBAL_STORAGE_SCOPE, "storage.bucket.create");
  assert.throws(
    () => assertGlobalScope({ kind: "workspace", workspaceId: "ws-1" }, "storage.bucket.create"),
    /not implemented for workspace scopes/
  );
});
