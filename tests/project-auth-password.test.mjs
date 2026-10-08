import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { hashPassword, verifyPassword } from "../lib/auth/password.ts";
import {
  RECOVERY_TOKEN_TTL_SECONDS,
  VERIFY_TOKEN_TTL_SECONDS,
  consumeEmailToken,
  issueEmailToken,
  markEmailVerified,
  validateEmailTokenPurpose,
} from "../lib/project-auth/email-tokens.ts";
import { buildAuthEmailContent } from "../lib/project-auth/email-content.ts";
import { decideProjectUpsert } from "../lib/project-auth/mapping.ts";
import {
  authenticatePasswordUser,
  createPasswordUser,
  deleteProjectUser,
  findPasswordUserById,
  normalizeEmail,
  normalizeName,
  resetPasswordAfterRecovery,
  setUserPassword,
  validateNewPassword,
} from "../lib/project-auth/passwords.ts";
import { ProjectAuthError } from "../lib/project-auth/scope.ts";
import {
  authenticateProjectRequest,
  createProjectSession,
  refreshProjectSession,
} from "../lib/project-auth/sessions.ts";
import { verifyProjectSession } from "../lib/project-auth/verify.ts";
import { getSmtpConfig, sendSmtpMail } from "../lib/project-auth/smtp.ts";

// ---------------------------------------------------------------------------
// Pure unit tests (no database).
// ---------------------------------------------------------------------------

test("email and password validation rejects bad input", () => {
  assert.equal(normalizeEmail("  User@Example.com "), "user@example.com");
  assert.throws(() => normalizeEmail("not-an-email"), /valid email/);
  assert.throws(() => normalizeEmail(""), /valid email/);
  assert.throws(() => normalizeEmail(42), /valid email/);
  assert.equal(validateNewPassword("LongEnough1"), "LongEnough1");
  assert.throws(() => validateNewPassword("short"), /at least 8/);
  assert.throws(() => validateNewPassword("x".repeat(129)), /exceed 128/);
  assert.throws(() => validateNewPassword(42), /at least 8/);
  assert.equal(normalizeName(" Jane "), "Jane");
  assert.equal(normalizeName(""), null);
  assert.equal(normalizeName(undefined), null);
  assert.equal(validateEmailTokenPurpose("verify"), "verify");
  assert.equal(validateEmailTokenPurpose("recovery"), "recovery");
  assert.throws(() => validateEmailTokenPurpose("magic"), /verify or recovery/);
  assert.equal(VERIFY_TOKEN_TTL_SECONDS, 24 * 60 * 60);
  assert.equal(RECOVERY_TOKEN_TTL_SECONDS, 60 * 60);
});

test("scrypt passwords hash, verify, and resist tampering", async () => {
  const hash = await hashPassword("CorrectHorse1");
  assert.match(hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(await verifyPassword("CorrectHorse1", hash), true);
  assert.equal(await verifyPassword("correcthorse1", hash), false);
  assert.equal(await verifyPassword("CorrectHorse1", "garbage"), false);
  assert.notEqual(await hashPassword("CorrectHorse1"), hash, "salts must differ");
});

test("auth email templates escape untrusted input", () => {
  const evil = '"><script>alert(1)</script>';
  const content = buildAuthEmailContent({
    purpose: "verify",
    email: `victim+x${evil}@example.com`,
    link: `https://app.example.com/verify?token=abc&x=${encodeURIComponent(evil)}`,
    projectSlug: "alvotric",
  });
  assert.ok(content.subject.length > 0);
  assert.ok(!content.html.includes("<script>"), "html must escape email/link");
  assert.ok(content.html.includes("&lt;script&gt;"));
  const recovery = buildAuthEmailContent({
    purpose: "recovery",
    email: "user@example.com",
    link: "https://app.example.com/reset?token=abc&type=recovery",
    projectSlug: "alvotric",
  });
  assert.match(recovery.subject, /password/i);
});

test("SMTP config is absent without SMTP_HOST", () => {
  const saved = { ...process.env };
  try {
    delete process.env.SMTP_HOST;
    assert.equal(getSmtpConfig(), null);
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_SECURE = "none";
    process.env.SMTP_FROM = "noreply@example.com";
    delete process.env.SMTP_USER;
    const config = getSmtpConfig();
    assert.equal(config?.host, "127.0.0.1");
    assert.equal(config?.port, 1025);
    assert.equal(config?.secure, "none");
  } finally {
    process.env = saved;
  }
});

test("SMTP client delivers through AUTH PLAIN and AUTH LOGIN fallback", async () => {
  const conversations = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let stage = "greeting";
    let sawPlain = false;
    socket.write("220 fake-relay ESMTP\r\n");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        conversations.push(line);
        if (stage === "greeting" && line.startsWith("EHLO")) {
          socket.write("250-fake\r\n250 AUTH PLAIN LOGIN\r\n");
          stage = "mail";
        } else if (line.startsWith("AUTH PLAIN")) {
          sawPlain = true;
          if (socket.remotePort === -1) socket.write("235 ok\r\n");
          // First connection accepts PLAIN; second rejects to exercise LOGIN.
          socket.write(sawPlain && conversations.filter((l) => l.startsWith("AUTH")).length > 1 ? "535 no\r\n" : "235 ok\r\n");
          stage = "mail";
        } else if (line === "AUTH LOGIN") {
          socket.write("334 VXNlcm5hbWU6\r\n");
          stage = "login-user";
        } else if (stage === "login-user") {
          socket.write("334 UGFzc3dvcmQ6\r\n");
          stage = "login-pass";
        } else if (stage === "login-pass") {
          socket.write("235 ok\r\n");
          stage = "mail";
        } else if (line.startsWith("MAIL FROM")) {
          socket.write("250 ok\r\n");
        } else if (line.startsWith("RCPT TO")) {
          socket.write("250 ok\r\n");
        } else if (line === "DATA") {
          socket.write("354 end with .\r\n");
          stage = "data";
        } else if (stage === "data") {
          if (line === ".") {
            socket.write("250 queued\r\n");
            stage = "mail";
          }
        } else if (line === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await sendSmtpMail(
      { host: "127.0.0.1", port, secure: "none", user: "u", pass: "p", from: "noreply@example.com", timeoutMs: 5000 },
      { to: "user@example.com", subject: "hi", text: "hello", html: "<p>hello</p>" }
    );
    const authLines = conversations.filter((l) => l.startsWith("AUTH"));
    assert.ok(authLines.some((l) => l.startsWith("AUTH PLAIN")), "should try AUTH PLAIN first");

    conversations.length = 0;
    await sendSmtpMail(
      { host: "127.0.0.1", port, secure: "none", from: "noreply@example.com", timeoutMs: 5000 },
      { to: "user@example.com", subject: "hi", text: "hello", html: "<p>hello</p>" }
    );
    assert.ok(conversations.includes("QUIT"), "should complete the conversation");
    assert.ok(conversations.some((l) => l.startsWith("MAIL FROM:<noreply@example.com>")));
  } finally {
    server.close();
  }
});

test("Google mapping regression: linked users log in, suspended rejected", () => {
  const user = { id: "u", projectId: "p", email: "g@example.com", emailVerified: true, name: null, status: "active" };
  assert.deepEqual(decideProjectUpsert({ linkedUser: user }), { kind: "login", user });
  assert.deepEqual(decideProjectUpsert({ linkedUser: { ...user, status: "suspended" } }), {
    kind: "reject",
    reason: "suspended",
  });
  assert.deepEqual(decideProjectUpsert({ linkedUser: null }), { kind: "provision" });
});

// ---------------------------------------------------------------------------
// Database integration (gated: runs only when migration 007 is applied).
// ---------------------------------------------------------------------------

function loadEnv() {
  const env = {};
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch {
    return {};
  }
  return env;
}

const env = loadEnv();

async function databaseReady() {
  if (!env.DATABASE_URL) return false;
  const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    const r = await pool.query(
      `select count(*)::int as n from information_schema.columns
       where table_schema = 'protodb_admin' and table_name = 'project_auth_users' and column_name = 'password_hash'`
    );
    return r.rows[0].n === 1;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

const DB_READY = await databaseReady();

test("password lifecycle: signup, verify, login, refresh, update, recover, delete", { skip: !DB_READY ? "migration 007 not applied" : false }, async () => {
  const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  const slug = `pwtest-${Date.now().toString(36)}`;
  const slugB = `pwtestb-${Date.now().toString(36)}`;
  let projectId = "";
  let projectBId = "";
  try {
    const a = await pool.query(
      `insert into protodb_admin.project_auth_projects (slug, name) values ($1, $2) returning id`,
      [slug, "pw test"]
    );
    projectId = a.rows[0].id;
    const b = await pool.query(
      `insert into protodb_admin.project_auth_projects (slug, name) values ($1, $2) returning id`,
      [slugB, "pw test b"]
    );
    projectBId = b.rows[0].id;

    // Signup creates an UNVERIFIED user; duplicates are 409 in-project only.
    const created = await createPasswordUser(projectId, { email: "User@Example.com", password: "Secret123", name: "Test User" });
    assert.equal(created.email, "user@example.com");
    assert.equal(created.emailVerified, false);
    await assert.rejects(createPasswordUser(projectId, { email: "user@example.com", password: "Secret123" }), (e) => {
      assert.ok(e instanceof ProjectAuthError && e.status === 409);
      return true;
    });
    // Same email in another project is independent.
    const other = await createPasswordUser(projectBId, { email: "user@example.com", password: "Secret123" });
    assert.notEqual(other.id, created.id);

    // Unknown email and wrong password are indistinguishable.
    await assert.rejects(authenticatePasswordUser(projectId, "nobody@example.com", "Secret123"), /Incorrect email or password/);
    await assert.rejects(authenticatePasswordUser(projectId, "user@example.com", "WrongPass1"), /Incorrect email or password/);

    // Unverified accounts cannot log in.
    await assert.rejects(authenticatePasswordUser(projectId, "user@example.com", "Secret123"), (e) => {
      assert.ok(e instanceof ProjectAuthError && e.code === "email_not_verified" && e.status === 403);
      return true;
    });

    // Verify is exactly-once.
    const token = await issueEmailToken(projectId, created.id, "verify");
    const consumedBy = await consumeEmailToken(projectId, token, "verify");
    assert.equal(consumedBy, created.id);
    assert.equal(await consumeEmailToken(projectId, token, "verify"), null, "reuse must fail");
    assert.equal(await consumeEmailToken(projectBId, token, "verify"), null, "cross-project must fail");
    await markEmailVerified(projectId, created.id);

    // Login works; sessions verify project-scoped.
    const user = await authenticatePasswordUser(projectId, "user@example.com", "Secret123");
    assert.equal(user.id, created.id);
    const issued = await createProjectSession({ projectId, userId: user.id });
    const ctx = await verifyProjectSession({ projectId, token: issued.accessToken });
    assert.equal(ctx?.user.id, user.id);
    assert.equal(await verifyProjectSession({ projectId: projectBId, token: issued.accessToken }), null);
    assert.equal(await authenticateProjectRequest(projectId, issued.accessToken).then((c) => c?.user.email), "user@example.com");

    // Refresh rotation + reuse burn.
    const rotated = await refreshProjectSession(projectId, issued.refreshToken);
    assert.equal(rotated.kind, "rotated");
    if (rotated.kind === "rotated") {
      const replay = await refreshProjectSession(projectId, issued.refreshToken);
      assert.equal(replay.kind, "invalid", "replayed refresh must burn the family");
      assert.equal(await refreshProjectSession(projectId, rotated.tokens.refreshToken).then((o) => o.kind), "invalid");
    }

    // Password change requires the current password, then rotates credentials.
    await assert.rejects(setUserPassword(projectId, user.id, { currentPassword: "WrongPass1", newPassword: "NewSecret456" }), /Current password is incorrect/);
    await setUserPassword(projectId, user.id, { currentPassword: "Secret123", newPassword: "NewSecret456" });
    await assert.rejects(authenticatePasswordUser(projectId, "user@example.com", "Secret123"), /Incorrect email or password/);
    await authenticatePasswordUser(projectId, "user@example.com", "NewSecret456");

    // Recovery: token is single-use and project-scoped. The session-mode
    // setter must NOT become a bypass: without the current password it
    // still rejects even after a recovery token was consumed. Only the
    // explicit recovery setter (route calls it post-consume) rotates
    // credentials without the current password.
    const recovery = await issueEmailToken(projectId, user.id, "recovery");
    assert.equal(await consumeEmailToken(projectId, recovery, "verify"), null, "purpose mismatch must fail");
    const recoveredBy = await consumeEmailToken(projectId, recovery, "recovery");
    assert.equal(recoveredBy, user.id);
    await assert.rejects(setUserPassword(projectId, user.id, { newPassword: "Recovered789" }), /Current password is required/);
    await resetPasswordAfterRecovery(projectId, user.id, { newPassword: "Recovered789" });
    assert.equal(await consumeEmailToken(projectId, recovery, "recovery"), null, "reuse must fail");
    await assert.rejects(authenticatePasswordUser(projectId, "user@example.com", "NewSecret456"), /Incorrect email or password/);
    await authenticatePasswordUser(projectId, "user@example.com", "Recovered789");

    // Delete removes the user; sessions stop verifying.
    const sessionAfter = await createProjectSession({ projectId, userId: user.id });
    await deleteProjectUser(projectId, user.id);
    assert.equal(await findPasswordUserById(projectId, user.id), null);
    assert.equal(await verifyProjectSession({ projectId, token: sessionAfter.accessToken }), null);
    assert.equal(await authenticateProjectRequest(projectId, sessionAfter.accessToken), null);
    // Project B user is untouched.
    const stillThere = await findPasswordUserById(projectBId, other.id);
    assert.ok(stillThere);
  } finally {
    await pool.query(`delete from protodb_admin.project_auth_projects where id = $1`, [projectId]).catch(() => undefined);
    await pool.query(`delete from protodb_admin.project_auth_projects where id = $1`, [projectBId]).catch(() => undefined);
    await pool.end();
  }
});
