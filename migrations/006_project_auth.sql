-- Project-scoped Auth (Supabase-like) for external applications.
--
-- NOT YET APPLIED — do not run until the project-auth code paths are
-- deployed. All statements are idempotent (`if not exists`).
--
-- Design notes (see lib/project-auth/scope.ts for the full boundary doc):
-- - Admin authentication (`protodb_admin.users/sessions`) is untouched.
-- - Identities are PROJECT-SCOPED: the same Google account may exist
--   independently in many projects, so uniqueness is
--   (project_id, provider, provider_sub) — deliberately NOT global.
-- - One Google identity links to at most one user per project-user row:
--   unique (project_user_id, provider).
-- - PostgreSQL is the control plane only. Tokens are stored as SHA-256
--   hashes, exactly like admin sessions; raw tokens never persist.

create table if not exists protodb_admin.project_auth_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$'),
  name text not null,
  created_by uuid references protodb_admin.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists protodb_admin.project_auth_providers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references protodb_admin.project_auth_projects(id) on delete cascade,
  provider text not null check (provider = 'google'),
  enabled boolean not null default true,
  client_id text not null,
  client_secret_enc jsonb not null,
  allowed_redirect_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, provider)
);

create table if not exists protodb_admin.project_auth_users (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references protodb_admin.project_auth_projects(id) on delete cascade,
  email text not null,
  email_verified boolean not null default false,
  name text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, email)
);

create index if not exists project_auth_users_project_idx
  on protodb_admin.project_auth_users(project_id);

create table if not exists protodb_admin.project_auth_identities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references protodb_admin.project_auth_projects(id) on delete cascade,
  project_user_id uuid not null references protodb_admin.project_auth_users(id) on delete cascade,
  provider text not null check (provider = 'google'),
  provider_sub text not null,
  created_at timestamptz not null default now(),
  unique (project_id, provider, provider_sub),
  unique (project_user_id, provider)
);

create index if not exists project_auth_identities_lookup_idx
  on protodb_admin.project_auth_identities(project_id, provider, provider_sub);

create table if not exists protodb_admin.project_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references protodb_admin.project_auth_projects(id) on delete cascade,
  project_user_id uuid not null references protodb_admin.project_auth_users(id) on delete cascade,
  family_id uuid not null default gen_random_uuid(),
  refresh_token_hash text not null unique,
  access_token_hash text not null unique,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by uuid references protodb_admin.project_auth_sessions(id) on delete set null,
  created_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists project_auth_sessions_user_idx
  on protodb_admin.project_auth_sessions(project_user_id);
create index if not exists project_auth_sessions_family_idx
  on protodb_admin.project_auth_sessions(family_id);

create table if not exists protodb_admin.project_auth_codes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references protodb_admin.project_auth_projects(id) on delete cascade,
  project_user_id uuid not null references protodb_admin.project_auth_users(id) on delete cascade,
  code_hash text not null unique,
  code_challenge text not null,
  redirect_uri text not null,
  app_state text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists project_auth_codes_expiry_idx
  on protodb_admin.project_auth_codes(expires_at);
