import { query, queryOne } from "../db/client.ts";
import {
  CredentialVaultError,
  encryptCredential,
  type EncryptedCredentialEnvelope,
} from "../credentials/credential-vault.ts";
import {
  ProjectAuthError,
  validateProjectName,
  validateProjectSlug,
  type ProjectRecord,
} from "./scope.ts";
import type { ProjectGoogleProvider } from "./providers.ts";

/**
 * Project control-plane database operations. All reads/writes are
 * keyed by project ID resolved from the URL slug at the route layer,
 * so no query in this module can ever cross a project boundary by
 * accident. Admin identity/authorization stays in the routes.
 */

export async function resolveProjectBySlug(slug: string): Promise<ProjectRecord | null> {
  return queryOne<ProjectRecord>(
    `select id, slug, name from protodb_admin.project_auth_projects where slug = $1`,
    [slug]
  );
}

export async function resolveProjectById(id: string): Promise<ProjectRecord | null> {
  return queryOne<ProjectRecord>(
    `select id, slug, name from protodb_admin.project_auth_projects where id = $1`,
    [id]
  );
}

export interface ProjectListRow {
  id: string;
  slug: string;
  name: string;
  created_at: Date | string;
  google_enabled: boolean;
}

export async function listProjects(): Promise<ProjectListRow[]> {
  return query<ProjectListRow>(
    `select p.id, p.slug, p.name, p.created_at,
            exists(select 1 from protodb_admin.project_auth_providers pr
                   where pr.project_id = p.id and pr.provider = 'google' and pr.enabled) as google_enabled
     from protodb_admin.project_auth_projects p
     order by p.created_at desc, p.id desc`
  );
}

export async function createProject(input: {
  slug: unknown;
  name: unknown;
  createdBy: string;
}): Promise<ProjectRecord> {
  const slug = validateProjectSlug(input.slug);
  const name = validateProjectName(input.name);
  try {
    const rows = await query<ProjectRecord>(
      `insert into protodb_admin.project_auth_projects (slug, name, created_by)
       values ($1, $2, $3)
       returning id, slug, name`,
      [slug, name, input.createdBy]
    );
    if (!rows[0]) throw new ProjectAuthError("Project could not be created.", 503);
    return rows[0];
  } catch (error) {
    if (error instanceof ProjectAuthError) throw error;
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505") {
      throw new ProjectAuthError("A project with this slug already exists.", 409);
    }
    throw new ProjectAuthError("Project could not be created.", 503);
  }
}

export async function updateProjectName(id: string, name: unknown): Promise<ProjectRecord> {
  const validated = validateProjectName(name);
  const rows = await query<ProjectRecord>(
    `update protodb_admin.project_auth_projects
     set name = $2, updated_at = now()
     where id = $1
     returning id, slug, name`,
    [id, validated]
  );
  if (!rows[0]) throw new ProjectAuthError("Project was not found.", 404);
  return rows[0];
}

export interface ProviderRow {
  id: string;
  project_id: string;
  enabled: boolean;
  client_id: string;
  client_secret_enc: EncryptedCredentialEnvelope;
  allowed_redirect_urls: string[];
}

export async function getProjectGoogleProvider(projectId: string): Promise<ProviderRow | null> {
  return queryOne<ProviderRow>(
    `select id, project_id, enabled, client_id, client_secret_enc, allowed_redirect_urls
     from protodb_admin.project_auth_providers
     where project_id = $1 and provider = 'google'`,
    [projectId]
  );
}

export async function setProjectGoogleProvider(input: {
  projectId: string;
  clientId: string;
  clientSecret: string | null;
  redirectUrls: string[];
  enabled: boolean;
}): Promise<ProjectGoogleProvider> {
  if (input.clientSecret !== null) {
    if (input.clientSecret.length === 0 || input.clientSecret.length > 1024) {
      throw new ProjectAuthError("Google client secret must be between 1 and 1024 characters.");
    }
    let envelope: EncryptedCredentialEnvelope;
    try {
      envelope = encryptCredential(input.clientSecret, "google_client_secret");
    } catch (error) {
      if (error instanceof CredentialVaultError) {
        throw new ProjectAuthError("Credential encryption is not configured.", 503);
      }
      throw error;
    }
    const row = await queryOne<ProviderRow>(
      `insert into protodb_admin.project_auth_providers
         (project_id, provider, enabled, client_id, client_secret_enc, allowed_redirect_urls, updated_at)
       values ($1, 'google', $2, $3, $4, $5, now())
       on conflict (project_id, provider) do update set
         enabled = excluded.enabled,
         client_id = excluded.client_id,
         client_secret_enc = excluded.client_secret_enc,
         allowed_redirect_urls = excluded.allowed_redirect_urls,
         updated_at = now()
       returning id, project_id, enabled, client_id, client_secret_enc, allowed_redirect_urls`,
      [input.projectId, input.enabled, input.clientId, envelope, input.redirectUrls]
    );
    if (!row) throw new ProjectAuthError("Google provider could not be saved.", 503);
    return toProvider(row);
  }
  const row = await queryOne<ProviderRow>(
    `update protodb_admin.project_auth_providers
     set enabled = $2, client_id = $3, allowed_redirect_urls = $4, updated_at = now()
     where project_id = $1 and provider = 'google'
     returning id, project_id, enabled, client_id, client_secret_enc, allowed_redirect_urls`,
    [input.projectId, input.enabled, input.clientId, input.redirectUrls]
  );
  if (!row) throw new ProjectAuthError("A client secret is required on first setup.", 400);
  return toProvider(row);
}

function toProvider(row: ProviderRow): ProjectGoogleProvider {
  return {
    id: row.id,
    projectId: row.project_id,
    enabled: row.enabled,
    clientId: row.client_id,
    allowedRedirectUrls: row.allowed_redirect_urls,
  };
}
