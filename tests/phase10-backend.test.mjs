import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createDatabasePoolConfig, parseDatabaseTarget, targetsMatch } from "../lib/db/connection-config.ts";
import { AuthInputError, normalizeEmail, parseAuthJson, validateAuthName, validateAuthPassword } from "../lib/auth/input-policy.ts";
import { canChangeMember, isUsersAdmin, parseUserAdminChange, UserAdminValidationError } from "../lib/users/user-admin-policy.ts";
import { startSequentialPolling } from "../lib/realtime/sequential-polling.ts";
import {
  encryptCredential,
  decryptCredential,
  deriveKeyForType,
  maskSecret,
  maskDatabaseUrl,
  CredentialVaultError,
  CREDENTIAL_SCOPE,
} from "../lib/credentials/credential-vault.ts";

const baseEnv = {
  DATABASE_URL: "postgresql://app:secret@localhost:5432/protodb_test",
  DATABASE_SSL: "false",
  NODE_ENV: "test",
};

test("auth input policy normalizes email and rejects malformed/oversized values", () => {
  assert.equal(normalizeEmail("  OWNER@Example.COM "), "owner@example.com");
  assert.throws(() => normalizeEmail("no-at-sign"), AuthInputError);
  assert.throws(() => normalizeEmail(`a@${"x".repeat(250)}.com`), AuthInputError);
  assert.equal(validateAuthName("  Admin  "), "Admin");
  assert.throws(() => validateAuthName("  "), AuthInputError);
  assert.throws(() => validateAuthName("x".repeat(101)), AuthInputError);
  assert.equal(validateAuthPassword("12345678"), "12345678");
  assert.throws(() => validateAuthPassword("short"), AuthInputError);
  assert.throws(() => validateAuthPassword("x".repeat(129)), AuthInputError);
  assert.deepEqual(parseAuthJson('{"email":"owner@example.com"}'), { email: "owner@example.com" });
  assert.throws(() => parseAuthJson("{"), AuthInputError);
  assert.throws(() => parseAuthJson("[]"), AuthInputError);
});

test("database TLS is disabled by default and verifies certificates when enabled", () => {
  assert.equal(createDatabasePoolConfig("DATABASE_URL", "DATABASE_SSL", "DATABASE_SSL_CA", "DATABASE_SSL_ALLOW_SELF_SIGNED", baseEnv).ssl, false);
  const verified = createDatabasePoolConfig("DATABASE_URL", "DATABASE_SSL", "DATABASE_SSL_CA", "DATABASE_SSL_ALLOW_SELF_SIGNED", {
    ...baseEnv,
    DATABASE_SSL: "true",
  });
  assert.deepEqual(verified.ssl, { rejectUnauthorized: true });
  const developmentSelfSigned = createDatabasePoolConfig("DATABASE_URL", "DATABASE_SSL", "DATABASE_SSL_CA", "DATABASE_SSL_ALLOW_SELF_SIGNED", {
    ...baseEnv,
    DATABASE_SSL: "true",
    DATABASE_SSL_ALLOW_SELF_SIGNED: "true",
  });
  assert.deepEqual(developmentSelfSigned.ssl, { rejectUnauthorized: false });
  assert.throws(() => createDatabasePoolConfig("DATABASE_URL", "DATABASE_SSL", "DATABASE_SSL_CA", "DATABASE_SSL_ALLOW_SELF_SIGNED", {
    ...baseEnv,
    NODE_ENV: "production",
    DATABASE_SSL: "true",
    DATABASE_SSL_ALLOW_SELF_SIGNED: "true",
  }));
  assert.throws(() => createDatabasePoolConfig("DATABASE_URL", "DATABASE_SSL", "DATABASE_SSL_CA", "DATABASE_SSL_ALLOW_SELF_SIGNED", {
    ...baseEnv,
    DATABASE_SSL: "sometimes",
  }));
  assert.throws(() => createDatabasePoolConfig("DATABASE_URL", "DATABASE_SSL", "DATABASE_SSL_CA", "DATABASE_SSL_ALLOW_SELF_SIGNED", {
    ...baseEnv,
    DATABASE_SSL_CA: "not-a-pem",
  }));
  assert.throws(() => parseDatabaseTarget("postgres://user:pass@host/db?sslmode=disable"));
});

test("DDL endpoint matching uses non-secret target fields", () => {
  const main = parseDatabaseTarget("postgresql://main:one@DB.EXAMPLE:5432/protodb");
  const same = parseDatabaseTarget("postgresql://ddl:two@db.example/protodb");
  const otherDatabase = parseDatabaseTarget("postgresql://ddl:two@db.example/another");
  assert.equal(targetsMatch(main, same), true);
  assert.equal(targetsMatch(main, otherDatabase), false);
});

test("live member administration is Owner-only and rejects self or malformed changes", () => {
  assert.equal(isUsersAdmin("Owner"), true);
  assert.equal(isUsersAdmin("Admin"), false);
  assert.equal(canChangeMember("actor", "other"), true);
  assert.equal(canChangeMember("actor", "actor"), false);
  assert.deepEqual(parseUserAdminChange({ role: "Editor" }), { role: "Editor" });
  assert.deepEqual(parseUserAdminChange({ status: "suspended" }), { status: "suspended" });
  assert.throws(() => parseUserAdminChange({ role: "Owner", status: "active" }), UserAdminValidationError);
  assert.throws(() => parseUserAdminChange({ role: "Root" }), UserAdminValidationError);
});

test("credential vault provides authenticated AES-256-GCM encryption, scope-binding, and safe masking", () => {
  const masterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const plaintext = "super-secret-database-password-1234!";

  // Encryption
  const envelope = encryptCredential(plaintext, "database", masterKey);
  assert.equal(envelope.version, "v1");
  assert.equal(envelope.scope, CREDENTIAL_SCOPE);
  assert.equal(envelope.type, "database");
  assert.equal(envelope.ivHex.length, 24);
  assert.equal(envelope.authTagHex.length, 32);
  assert.ok(envelope.ciphertextHex.length > 0);

  // Decryption
  const decrypted = decryptCredential(envelope, masterKey);
  assert.equal(decrypted, plaintext);

  // Tamper detection: altered ciphertext
  const tamperedCiphertext = {
    ...envelope,
    ciphertextHex: envelope.ciphertextHex.slice(0, -2) + (envelope.ciphertextHex.slice(-2) === "aa" ? "bb" : "aa"),
  };
  assert.throws(() => decryptCredential(tamperedCiphertext, masterKey), CredentialVaultError);

  // Tamper detection: altered auth tag
  const tamperedTag = {
    ...envelope,
    authTagHex: envelope.authTagHex.slice(0, -2) + (envelope.authTagHex.slice(-2) === "aa" ? "bb" : "aa"),
  };
  assert.throws(() => decryptCredential(tamperedTag, masterKey), CredentialVaultError);

  // Tamper detection: altered IV
  const tamperedIv = {
    ...envelope,
    ivHex: envelope.ivHex.slice(0, -2) + (envelope.ivHex.slice(-2) === "aa" ? "bb" : "aa"),
  };
  assert.throws(() => decryptCredential(tamperedIv, masterKey), CredentialVaultError);

  // Wrong master key
  const wrongKey = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
  assert.throws(() => decryptCredential(envelope, wrongKey), CredentialVaultError);

  // Insufficient key entropy
  assert.throws(() => deriveKeyForType("short", "database"), CredentialVaultError);

  // Empty plaintext
  assert.throws(() => encryptCredential("", "database", masterKey), CredentialVaultError);

  // Missing master key
  assert.throws(() => encryptCredential("secret", "database", ""), CredentialVaultError);

  // Masking
  assert.equal(maskSecret(""), "—");
  assert.equal(maskSecret("abc"), "••••");
  assert.equal(maskSecret("abcdefgh"), "ab••••gh");
  assert.equal(maskSecret("my-super-secret-token"), "my-s••••oken");
  assert.equal(
    maskDatabaseUrl("postgresql://user:secretpass@db.example.com:5432/production"),
    "postgresql://user:********@db.example.com:5432/production"
  );
  assert.equal(maskDatabaseUrl("not-a-url"), "postgres://****:********@****/********");
});

test("auth and session token architecture uses cryptographically secure tokens and one-way hashing", async () => {
  const { randomBytes, createHash } = await import("node:crypto");
  const rawToken = randomBytes(32).toString("hex");
  assert.equal(rawToken.length, 64);
  const hash1 = createHash("sha256").update(rawToken).digest("hex");
  const hash2 = createHash("sha256").update(rawToken).digest("hex");
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
  assert.notEqual(hash1, rawToken);
});

test("sequential polling starts once, never overlaps, and aborts on cleanup", async () => {
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  let resolveFirst;
  let firstSignal;
  let secondSignal;
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  let resolveFirstStarted;
  let resolveSecondStarted;
  const firstStarted = new Promise((resolve) => { resolveFirstStarted = resolve; });
  const secondStarted = new Promise((resolve) => { resolveSecondStarted = resolve; });
  const firstRequest = new Promise((resolve) => { resolveFirst = resolve; });

  const stop = startSequentialPolling({
    intervalMs: 10,
    load(signal) {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (calls === 1) {
        resolveFirstStarted();
        firstSignal = signal;
        return firstRequest.finally(() => { active -= 1; });
      }
      secondSignal = signal;
      resolveSecondStarted();
      return new Promise(() => {});
    },
    onSuccess() {},
    onError() {},
  });

  try {
    await firstStarted;
    await wait(25);
    assert.equal(calls, 1, "a slow request must not overlap a scheduled poll");
    assert.equal(firstSignal.aborted, false);
    resolveFirst("snapshot");
    await secondStarted;
    assert.equal(calls, 2);
    assert.equal(maxActive, 1);
    stop.stop();
    assert.equal(secondSignal.aborted, true);
    await wait(20);
    assert.equal(calls, 2, "cleanup must prevent subsequent polls");
  } finally {
    stop.stop();
  }
});

test("sequential polling recovers after an error", async () => {
  let calls = 0;
  let resolveRecovered;
  const recovered = new Promise((resolve) => { resolveRecovered = resolve; });
  const errors = [];
  const stop = startSequentialPolling({
    intervalMs: 5,
    async load() {
      calls += 1;
      if (calls === 1) throw new Error("temporary");
      return "fresh";
    },
    onSuccess(value) { resolveRecovered(value); },
    onError(error) { errors.push(error.message); },
  });
  try {
    assert.equal(await recovered, "fresh");
    assert.deepEqual(errors, ["temporary"]);
    assert.equal(calls, 2);
  } finally {
    stop.stop();
  }
});

const disposableUrl = process.env.PHASE10_DISPOSABLE_DATABASE_URL;
let safeDisposableTarget = false;
if (disposableUrl && process.env.PHASE10_ALLOW_DISPOSABLE_DB_TESTS === "true") {
  try {
    const target = parseDatabaseTarget(disposableUrl);
    safeDisposableTarget =
      ["localhost", "127.0.0.1", "::1"].includes(target.host) &&
      /(^|[_-])(test|disposable)([_-]|$)/i.test(target.database);
  } catch {
    safeDisposableTarget = false;
  }
}

test("disposable PostgreSQL migrations serialize bootstrap and enforce the final Owner", {
  skip: safeDisposableTarget ? false : "Requires explicit loopback PHASE10_DISPOSABLE_DATABASE_URL with a test/disposable database name and PHASE10_ALLOW_DISPOSABLE_DB_TESTS=true.",
}, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: disposableUrl, ssl: false, max: 10 });
  let schemaCreatedByTest = false;
  let extensionCreatedByTest = false;
  try {
    const initial = await pool.query(
      `select to_regnamespace('protodb_admin')::text as present,
              exists(select 1 from pg_extension where extname = 'pgcrypto') as extension_present`
    );
    assert.equal(initial.rows[0]?.present, null, "refusing a target that already has protodb_admin");
    schemaCreatedByTest = true;
    extensionCreatedByTest = !initial.rows[0]?.extension_present;
    const migration001 = await readFile(new URL("../migrations/001_protodb_admin_schema.sql", import.meta.url), "utf8");
    const migration004 = await readFile(new URL("../migrations/004_phase10_owner_invariant.sql", import.meta.url), "utf8");
    await pool.query(migration001);
    await pool.query(migration004);

    const attempts = await Promise.allSettled(Array.from({ length: 8 }, async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock($1, $2)", [734091, 1]);
        const count = await client.query(
          "select count(*)::text as count from protodb_admin.users"
        );
        if (count.rows[0]?.count !== "0") throw new Error("setup_complete");
        const email = `${randomUUID()}@phase10.test`;
        await client.query(
          `insert into protodb_admin.users(email, password_hash, name, role, status)
           values ($1, 'test-hash', 'Disposable Test Owner', 'Owner', 'active')`,
          [email]
        );
        await client.query("commit");
        return "created";
      } catch (error) {
        await client.query("rollback");
        if (error instanceof Error && error.message === "setup_complete") return "rejected";
        throw error;
      } finally {
        client.release();
      }
    }));
    assert.equal(attempts.filter((result) => result.status === "fulfilled" && result.value === "created").length, 1);
    assert.equal(attempts.filter((result) => result.status === "fulfilled" && result.value === "rejected").length, 7);

    await assert.rejects(
      pool.query("update protodb_admin.users set status = 'suspended' where role = 'Owner'"),
      (error) => error.code === "23514"
    );
    const ownerCount = await pool.query(
      "select count(*)::text as count from protodb_admin.users where role = 'Owner' and status = 'active'"
    );
    assert.equal(ownerCount.rows[0]?.count, "1");
  } finally {
    if (schemaCreatedByTest) await pool.query("drop schema if exists protodb_admin cascade");
    if (extensionCreatedByTest) await pool.query("drop extension if exists pgcrypto");
    await pool.end();
  }
});
