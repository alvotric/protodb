import { query, queryOne } from "../db/client.ts";
import { generateProjectToken, hashProjectToken } from "./tokens.ts";
import { ProjectAuthError } from "./scope.ts";

export type EmailTokenPurpose = "verify" | "recovery";

/** Verification links live 24h; recovery links 1h. */
export const VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const RECOVERY_TOKEN_TTL_SECONDS = 60 * 60;

function ttlFor(purpose: EmailTokenPurpose): number {
  return purpose === "verify" ? VERIFY_TOKEN_TTL_SECONDS : RECOVERY_TOKEN_TTL_SECONDS;
}

export function validateEmailTokenPurpose(value: unknown): EmailTokenPurpose {
  if (value === "verify" || value === "recovery") return value;
  throw new ProjectAuthError("Email token purpose must be verify or recovery.");
}

/**
 * Issues a one-time token. Any previous live token of the same purpose
 * for the same user is superseded so only the newest email works.
 * Returns the RAW token (emailed); only its hash persists.
 */
export async function issueEmailToken(
  projectId: string,
  userId: string,
  purpose: EmailTokenPurpose
): Promise<string> {
  const token = generateProjectToken();
  await query(
    `update protodb_admin.project_auth_email_tokens
     set consumed_at = now()
     where project_id = $1 and project_user_id = $2 and purpose = $3 and consumed_at is null`,
    [projectId, userId, purpose]
  ).catch(() => []);
  await query(
    `insert into protodb_admin.project_auth_email_tokens
       (project_id, project_user_id, purpose, token_hash, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
    [projectId, userId, purpose, hashProjectToken(token), ttlFor(purpose)]
  );
  return token;
}

interface EmailTokenRow {
  id: string;
  project_user_id: string;
}

/**
 * Consumes a token exactly once: exactly one concurrent caller wins the
 * `consumed_at is null` race. Returns the owning user id, else null.
 */
export async function consumeEmailToken(
  projectId: string,
  token: unknown,
  purpose: EmailTokenPurpose
): Promise<string | null> {
  if (typeof token !== "string" || token.length === 0) return null;
  const row = await queryOne<EmailTokenRow>(
    `select id, project_user_id
     from protodb_admin.project_auth_email_tokens
     where project_id = $1 and purpose = $2 and token_hash = $3
       and consumed_at is null and expires_at > now()`,
    [projectId, purpose, hashProjectToken(token)]
  ).catch(() => null);
  if (!row) return null;
  const consumed = await query<{ id: string }>(
    `update protodb_admin.project_auth_email_tokens
     set consumed_at = now()
     where id = $1 and consumed_at is null
     returning id`,
    [row.id]
  ).catch(() => []);
  if (!consumed[0]) return null;
  return row.project_user_id;
}

/** Marks the user's email verified (post-verify or post-recovery). */
export async function markEmailVerified(projectId: string, userId: string): Promise<void> {
  await query(
    `update protodb_admin.project_auth_users
     set email_verified = true, updated_at = now()
     where id = $1 and project_id = $2`,
    [userId, projectId]
  );
}
