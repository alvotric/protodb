import { query, queryOne, withTransaction } from "../db/client.ts";
import { ProjectAuthError } from "./scope.ts";
import type { GoogleIdentity } from "../auth/google.ts";
import type { ProjectUser } from "./mapping.ts";

export interface ProjectUserRow {
  id: string;
  project_id: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  status: "active" | "suspended";
}

function toUser(row: ProjectUserRow): ProjectUser {
  return {
    id: row.id,
    projectId: row.project_id,
    email: row.email,
    emailVerified: row.email_verified,
    name: row.name,
    status: row.status,
  };
}

export async function findProjectIdentityUser(
  projectId: string,
  providerSub: string
): Promise<ProjectUser | null> {
  const row = await queryOne<ProjectUserRow>(
    `select u.id, u.project_id, u.email, u.email_verified, u.name, u.status
     from protodb_admin.project_auth_identities i
     join protodb_admin.project_auth_users u on u.id = i.project_user_id
     where i.project_id = $1 and i.provider = 'google' and i.provider_sub = $2`,
    [projectId, providerSub]
  );
  return row ? toUser(row) : null;
}

export async function findProjectUserByEmail(
  projectId: string,
  email: string
): Promise<ProjectUser | null> {
  const row = await queryOne<ProjectUserRow>(
    `select id, project_id, email, email_verified, name, status
     from protodb_admin.project_auth_users
     where project_id = $1 and email = $2`,
    [projectId, email]
  );
  return row ? toUser(row) : null;
}

/**
 * Resolves (or provisions) the project user for a verified Google
 * identity. Unique constraints arbitrate races: concurrent first logins
 * for the same subject collapse onto the single winning row.
 */
export async function resolveProjectGoogleUser(
  projectId: string,
  identity: GoogleIdentity
): Promise<{ user: ProjectUser; created: boolean }> {
  const existing = await findProjectIdentityUser(projectId, identity.sub);
  if (existing) {
    if (existing.status === "suspended") {
      throw new ProjectAuthError("This account is unavailable.", 403);
    }
    return { user: existing, created: false };
  }

  const name = identity.name?.slice(0, 100) ?? null;
  try {
    const user = await withTransaction(async (client) => {
      const inserted = await client.query<ProjectUserRow>(
        `insert into protodb_admin.project_auth_users
           (project_id, email, email_verified, name, status)
         values ($1, $2, true, $3, 'active')
         on conflict (project_id, email) do nothing
         returning id, project_id, email, email_verified, name, status`,
        [projectId, identity.email, name]
      );
      let row = inserted.rows[0] ?? null;
      const created = Boolean(row);
      if (!row) {
        const current = await client.query<ProjectUserRow>(
          `select id, project_id, email, email_verified, name, status
           from protodb_admin.project_auth_users
           where project_id = $1 and email = $2`,
          [projectId, identity.email]
        );
        row = current.rows[0] ?? null;
      }
      if (!row) throw new ProjectAuthError("Account could not be created.", 503);
      if (row.status === "suspended") {
        throw new ProjectAuthError("This account is unavailable.", 403);
      }
      if (!row.email_verified) {
        const verified = await client.query<ProjectUserRow>(
          `update protodb_admin.project_auth_users
           set email_verified = true, updated_at = now()
           where id = $1
           returning id, project_id, email, email_verified, name, status`,
          [row.id]
        );
        if (verified.rows[0]) row = verified.rows[0];
      }
      await client.query(
        `insert into protodb_admin.project_auth_identities
           (project_id, project_user_id, provider, provider_sub)
         values ($1, $2, 'google', $3)
         on conflict do nothing`,
        [projectId, row.id, identity.sub]
      );
      return { row, created };
    });
    return { user: toUser(user.row), created: user.created };
  } catch (error) {
    if (error instanceof ProjectAuthError) throw error;
    throw new ProjectAuthError("Account resolution failed.", 503);
  }
}

export async function listProjectUsers(projectId: string, limit = 100): Promise<ProjectUser[]> {
  const bounded = Math.min(Math.max(Math.floor(limit) || 100, 1), 500);
  const rows = await query<ProjectUserRow>(
    `select id, project_id, email, email_verified, name, status
     from protodb_admin.project_auth_users
     where project_id = $1
     order by created_at desc, id desc
     limit $2`,
    [projectId, bounded]
  );
  return rows.map(toUser);
}

export async function setProjectUserStatus(
  projectId: string,
  userId: string,
  status: "active" | "suspended"
): Promise<ProjectUser> {
  const rows = await query<ProjectUserRow>(
    `update protodb_admin.project_auth_users
     set status = $3, updated_at = now()
     where id = $1 and project_id = $2
     returning id, project_id, email, email_verified, name, status`,
    [userId, projectId, status]
  );
  if (!rows[0]) throw new ProjectAuthError("Project user was not found.", 404);
  if (status === "suspended") {
    await query(
      `update protodb_admin.project_auth_sessions
       set revoked_at = now()
       where project_user_id = $1 and revoked_at is null`,
      [userId]
    );
  }
  return toUser(rows[0]);
}
