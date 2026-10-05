import { query, queryOne, withTransaction } from "../db/client.ts";
import { ProjectAuthError } from "./scope.ts";
import {
  PROJECT_ACCESS_TOKEN_TTL_SECONDS,
  PROJECT_REFRESH_TOKEN_TTL_SECONDS,
  generateProjectToken,
  hashProjectToken,
} from "./tokens.ts";
import type { ProjectUser } from "./mapping.ts";

export interface ProjectSession {
  id: string;
  familyId: string;
  projectId: string;
  userId: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

interface SessionRow {
  id: string;
  family_id: string;
  project_id: string;
  project_user_id: string;
  access_expires_at: Date | string;
  refresh_expires_at: Date | string;
}

export interface ProjectAuthContext {
  session: ProjectSession;
  user: ProjectUser;
}

function toSession(row: SessionRow): ProjectSession {
  return {
    id: row.id,
    familyId: row.family_id,
    projectId: row.project_id,
    userId: row.project_user_id,
    accessExpiresAt: new Date(row.access_expires_at),
    refreshExpiresAt: new Date(row.refresh_expires_at),
  };
}

export interface IssuedProjectTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  session: ProjectSession;
}

export async function createProjectSession(input: {
  projectId: string;
  userId: string;
  ip?: string;
  userAgent?: string;
}): Promise<IssuedProjectTokens> {
  const accessToken = generateProjectToken();
  const refreshToken = generateProjectToken();
  const rows = await query<SessionRow>(
    `insert into protodb_admin.project_auth_sessions
       (project_id, project_user_id, refresh_token_hash, access_token_hash,
        access_expires_at, refresh_expires_at, created_ip, user_agent)
     values ($1, $2, $3, $4, now() + make_interval(secs => $5), now() + make_interval(secs => $6), $7, $8)
     returning id, family_id, project_id, project_user_id, access_expires_at, refresh_expires_at`,
    [
      input.projectId,
      input.userId,
      hashProjectToken(refreshToken),
      hashProjectToken(accessToken),
      PROJECT_ACCESS_TOKEN_TTL_SECONDS,
      PROJECT_REFRESH_TOKEN_TTL_SECONDS,
      input.ip?.slice(0, 100) ?? null,
      input.userAgent?.slice(0, 300) ?? null,
    ]
  );
  if (!rows[0]) throw new ProjectAuthError("Session could not be created.", 503);
  return {
    accessToken,
    refreshToken,
    expiresIn: PROJECT_ACCESS_TOKEN_TTL_SECONDS,
    session: toSession(rows[0]),
  };
}

/** Resolves a Bearer access token to its session + active user, all project-scoped. */
export async function authenticateProjectRequest(
  projectId: string,
  accessToken: string
): Promise<ProjectAuthContext | null> {
  const row = await queryOne<SessionRow & {
    email: string;
    email_verified: boolean;
    name: string | null;
    status: "active" | "suspended";
  }>(
    `select s.id, s.family_id, s.project_id, s.project_user_id,
            s.access_expires_at, s.refresh_expires_at,
            u.email, u.email_verified, u.name, u.status
     from protodb_admin.project_auth_sessions s
     join protodb_admin.project_auth_users u on u.id = s.project_user_id
     where s.project_id = $1
       and s.access_token_hash = $2
       and s.revoked_at is null
       and s.access_expires_at > now()`,
    [projectId, hashProjectToken(accessToken)]
  );
  if (!row || row.status === "suspended") return null;
  return {
    session: toSession(row),
    user: {
      id: row.project_user_id,
      projectId: row.project_id,
      email: row.email,
      emailVerified: row.email_verified,
      name: row.name,
      status: row.status,
    },
  };
}

export type RefreshOutcome =
  | { kind: "rotated"; tokens: IssuedProjectTokens }
  | { kind: "invalid" };

/**
 * Rotates a refresh token. Presenting an already-rotated (replaced) or
 * revoked token signals theft: the whole session family is revoked and
 * the caller gets a plain invalid response (no existence oracle beyond
 * what a valid token already proves).
 */
export async function refreshProjectSession(
  projectId: string,
  refreshToken: string,
  input?: { ip?: string; userAgent?: string }
): Promise<RefreshOutcome> {
  const hash = hashProjectToken(refreshToken);
  const current = await queryOne<SessionRow>(
    `select id, family_id, project_id, project_user_id, access_expires_at, refresh_expires_at
     from protodb_admin.project_auth_sessions
     where project_id = $1 and refresh_token_hash = $2`,
    [projectId, hash]
  );
  if (!current) return { kind: "invalid" };
  const revokedOrReplaced = await queryOne<{ id: string }>(
    `select id from protodb_admin.project_auth_sessions
     where id = $1 and (revoked_at is not null or refresh_expires_at <= now())`,
    [current.id]
  );
  if (revokedOrReplaced) {
    await query(
      `update protodb_admin.project_auth_sessions
       set revoked_at = now()
       where family_id = $1 and revoked_at is null`,
      [current.family_id]
    );
    return { kind: "invalid" };
  }

  const rotated = await withTransaction(async (client) => {
    const accessToken = generateProjectToken();
    const nextRefreshToken = generateProjectToken();
    const inserted = await client.query<SessionRow>(
      `insert into protodb_admin.project_auth_sessions
         (project_id, project_user_id, family_id, refresh_token_hash, access_token_hash,
          access_expires_at, refresh_expires_at, created_ip, user_agent)
       values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6), now() + make_interval(secs => $7), $8, $9)
       returning id, family_id, project_id, project_user_id, access_expires_at, refresh_expires_at`,
      [
        projectId,
        current.project_user_id,
        current.family_id,
        hashProjectToken(nextRefreshToken),
        hashProjectToken(accessToken),
        PROJECT_ACCESS_TOKEN_TTL_SECONDS,
        PROJECT_REFRESH_TOKEN_TTL_SECONDS,
        input?.ip?.slice(0, 100) ?? null,
        input?.userAgent?.slice(0, 300) ?? null,
      ]
    );
    const next = inserted.rows[0];
    if (!next) throw new ProjectAuthError("Session could not be rotated.", 503);
    await client.query(
      `update protodb_admin.project_auth_sessions
       set revoked_at = now(), replaced_by = $2
       where id = $1`,
      [current.id, next.id]
    );
    return { session: toSession(next), accessToken, refreshToken: nextRefreshToken };
  });
  return {
    kind: "rotated",
    tokens: {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: PROJECT_ACCESS_TOKEN_TTL_SECONDS,
      session: rotated.session,
    },
  };
}

export async function revokeProjectSession(projectId: string, sessionId: string): Promise<void> {
  await query(
    `update protodb_admin.project_auth_sessions
     set revoked_at = now()
     where id = $1 and project_id = $2`,
    [sessionId, projectId]
  );
}

export async function revokeProjectSessionFamily(projectId: string, familyId: string): Promise<void> {
  await query(
    `update protodb_admin.project_auth_sessions
     set revoked_at = now()
     where project_id = $1 and family_id = $2 and revoked_at is null`,
    [projectId, familyId]
  );
}
