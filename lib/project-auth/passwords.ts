import { query, queryOne } from "../db/client.ts";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { ProjectAuthError } from "./scope.ts";
import type { ProjectUser } from "./mapping.ts";

export interface PasswordUserRow {
  id: string;
  project_id: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  status: "active" | "suspended";
  password_hash: string | null;
}

function toUser(row: PasswordUserRow): ProjectUser {
  return {
    id: row.id,
    projectId: row.project_id,
    email: row.email,
    emailVerified: row.email_verified,
    name: row.name,
    status: row.status,
  };
}

/** Lowercase + trim; rejects malformed addresses early (routes re-check length). */
export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new ProjectAuthError("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ProjectAuthError("Enter a valid email address.");
  }
  return email;
}

export function validateNewPassword(value: unknown): string {
  if (typeof value !== "string") throw new ProjectAuthError("Password must be at least 8 characters.");
  if (value.length < 8) throw new ProjectAuthError("Password must be at least 8 characters.");
  if (value.length > 128) throw new ProjectAuthError("Password must not exceed 128 characters.");
  return value;
}

export function normalizeName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ProjectAuthError("Name must be a string.");
  const name = value.trim().slice(0, 100);
  return name.length > 0 ? name : null;
}

/** Constant dummy hash so unknown-email logins cost the same as real ones. */
const DUMMY_HASH = "0".repeat(32) + ":" + "0".repeat(128);

export async function findPasswordUserRow(
  projectId: string,
  email: string
): Promise<PasswordUserRow | null> {
  return queryOne<PasswordUserRow>(
    `select id, project_id, email, email_verified, name, status, password_hash
     from protodb_admin.project_auth_users
     where project_id = $1 and email = $2`,
    [projectId, email]
  );
}

export async function findPasswordUserById(
  projectId: string,
  userId: string
): Promise<PasswordUserRow | null> {
  return queryOne<PasswordUserRow>(
    `select id, project_id, email, email_verified, name, status, password_hash
     from protodb_admin.project_auth_users
     where id = $1 and project_id = $2`,
    [userId, projectId]
  );
}

/**
 * Creates an email/password user. Google-only users (password_hash NULL)
 * are untouched; a duplicate email in the SAME project is a 409.
 * Cross-project emails are independent (unique is (project_id, email)).
 */
export async function createPasswordUser(
  projectId: string,
  input: { email: unknown; password: unknown; name?: unknown }
): Promise<ProjectUser> {
  const email = normalizeEmail(input.email);
  const password = validateNewPassword(input.password);
  const name = normalizeName(input.name);
  const existing = await findPasswordUserRow(projectId, email).catch(() => null);
  if (existing) {
    throw new ProjectAuthError("An account with this email already exists.", 409);
  }
  const passwordHash = await hashPassword(password);
  try {
    const rows = await query<PasswordUserRow>(
      `insert into protodb_admin.project_auth_users
         (project_id, email, email_verified, name, status, password_hash)
       values ($1, $2, false, $3, 'active', $4)
       returning id, project_id, email, email_verified, name, status, password_hash`,
      [projectId, email, name, passwordHash]
    );
    if (!rows[0]) throw new ProjectAuthError("Account could not be created.", 503);
    return toUser(rows[0]);
  } catch (error) {
    if (error instanceof ProjectAuthError) throw error;
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505") {
      throw new ProjectAuthError("An account with this email already exists.", 409);
    }
    throw new ProjectAuthError("Account could not be created.", 503);
  }
}

/**
 * Password login. Unknown email, missing password credential, and wrong
 * password all surface as the same invalid error (no oracle); unverified
 * email and suspension have distinct codes for UX mapping.
 */
export async function authenticatePasswordUser(
  projectId: string,
  emailInput: unknown,
  passwordInput: unknown
): Promise<ProjectUser> {
  const email = normalizeEmail(emailInput);
  if (typeof passwordInput !== "string" || passwordInput.length === 0) {
    throw new ProjectAuthError("Incorrect email or password.", 401, "invalid_grant");
  }
  const row = await findPasswordUserRow(projectId, email).catch(() => null);
  const hash = row?.password_hash ?? DUMMY_HASH;
  const ok = await verifyPassword(passwordInput, hash).catch(() => false);
  if (!row || !row.password_hash || !ok) {
    throw new ProjectAuthError("Incorrect email or password.", 401, "invalid_grant");
  }
  if (row.status === "suspended") {
    throw new ProjectAuthError("This account is unavailable.", 403, "account_suspended");
  }
  if (!row.email_verified) {
    throw new ProjectAuthError("Please verify your email before signing in.", 403, "email_not_verified");
  }
  return toUser(row);
}

/**
 * Sets a new password. When the account already has one, the current
 * password must match (prevents session-hijack password takeover).
 * Google-only accounts (no hash) may set their first password from an
 * authenticated session or a valid recovery token — both are explicit,
 * never automatic merging.
 */
export async function setUserPassword(
  projectId: string,
  userId: string,
  input: { currentPassword?: unknown; newPassword: unknown }
): Promise<ProjectUser> {
  const next = validateNewPassword(input.newPassword);
  const row = await queryOne<PasswordUserRow>(
    `select id, project_id, email, email_verified, name, status, password_hash
     from protodb_admin.project_auth_users
     where id = $1 and project_id = $2`,
    [userId, projectId]
  ).catch(() => null);
  if (!row) throw new ProjectAuthError("Account was not found.", 404);
  if (row.status === "suspended") {
    throw new ProjectAuthError("This account is unavailable.", 403, "account_suspended");
  }
  if (row.password_hash) {
    if (typeof input.currentPassword !== "string" || input.currentPassword.length === 0) {
      throw new ProjectAuthError("Current password is required.", 403, "current_password_required");
    }
    const ok = await verifyPassword(input.currentPassword, row.password_hash).catch(() => false);
    if (!ok) throw new ProjectAuthError("Current password is incorrect.", 403, "current_password_invalid");
  }
  const passwordHash = await hashPassword(next);
  const updated = await query<PasswordUserRow>(
    `update protodb_admin.project_auth_users
     set password_hash = $3, updated_at = now()
     where id = $1 and project_id = $2
     returning id, project_id, email, email_verified, name, status, password_hash`,
    [userId, projectId, passwordHash]
  ).catch(() => []);
  if (!updated[0]) throw new ProjectAuthError("Password could not be updated.", 503);
  return toUser(updated[0]);
}

/**
 * Recovery-mode password reset. Call ONLY after a single-use recovery
 * token for this (projectId, userId) has been consumed via
 * consumeEmailToken (project-scoped, purpose-checked, exactly-once).
 * The consumed token already proves email ownership, so no current
 * password is required here. Session-mode callers must keep using
 * setUserPassword, which still requires the current password — this
 * function is reachable from unauthenticated callers only through a
 * valid recovery token consumed by the update-password route.
 */
export async function resetPasswordAfterRecovery(
  projectId: string,
  userId: string,
  input: { newPassword: unknown }
): Promise<ProjectUser> {
  const next = validateNewPassword(input.newPassword);
  const row = await queryOne<PasswordUserRow>(
    `select id, project_id, email, email_verified, name, status, password_hash
     from protodb_admin.project_auth_users
     where id = $1 and project_id = $2`,
    [userId, projectId]
  ).catch(() => null);
  if (!row) throw new ProjectAuthError("Account was not found.", 404);
  if (row.status === "suspended") {
    throw new ProjectAuthError("This account is unavailable.", 403, "account_suspended");
  }
  const passwordHash = await hashPassword(next);
  const updated = await query<PasswordUserRow>(
    `update protodb_admin.project_auth_users
     set password_hash = $3, updated_at = now()
     where id = $1 and project_id = $2
     returning id, project_id, email, email_verified, name, status, password_hash`,
    [userId, projectId, passwordHash]
  ).catch(() => []);
  if (!updated[0]) throw new ProjectAuthError("Password could not be updated.", 503);
  return toUser(updated[0]);
}

/**
 * Real project-user deletion (replaces any stub): revokes every session
 * in every family, then deletes the user row. Dependent identities,
 * sessions, codes, and email tokens cascade via FK. Application data
 * owned by this user in external apps is NOT touched here (Phase P2).
 */
export async function deleteProjectUser(projectId: string, userId: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    `select id from protodb_admin.project_auth_users where id = $1 and project_id = $2`,
    [userId, projectId]
  ).catch(() => null);
  if (!row) throw new ProjectAuthError("Account was not found.", 404);
  await query(
    `update protodb_admin.project_auth_sessions
     set revoked_at = now()
     where project_user_id = $1 and revoked_at is null`,
    [userId]
  ).catch(() => []);
  await query(
    `delete from protodb_admin.project_auth_users where id = $1 and project_id = $2`,
    [userId, projectId]
  );
}
