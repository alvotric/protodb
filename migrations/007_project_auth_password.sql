-- Project Auth: password credentials, email tokens, email outbox.
--
-- Additive follow-up to 006_project_auth.sql (which stays untouched).
-- All statements are idempotent (`if not exists`).
--
-- - `password_hash` is nullable: Google-only users keep working with NULL.
-- - One-time email tokens (verification + recovery) are stored as
--   SHA-256 hashes, same principle as sessions/codes in 006: a database
--   dump alone cannot be replayed. Exactly-once consumption is enforced
--   by the `consumed_at is null` predicate at consume time.
-- - `project_auth_email_outbox` records every auth email. When SMTP is
--   not configured (local development), the email is NOT sent over the
--   network: it is stored here as pending and the link is printed to the
--   server console so the flow stays usable on localhost.

alter table protodb_admin.project_auth_users
  add column if not exists password_hash text;

create table if not exists protodb_admin.project_auth_email_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references protodb_admin.project_auth_projects(id) on delete cascade,
  project_user_id uuid not null references protodb_admin.project_auth_users(id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'recovery')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists project_auth_email_tokens_user_idx
  on protodb_admin.project_auth_email_tokens(project_id, project_user_id, purpose);
create index if not exists project_auth_email_tokens_expiry_idx
  on protodb_admin.project_auth_email_tokens(expires_at);

create table if not exists protodb_admin.project_auth_email_outbox (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references protodb_admin.project_auth_projects(id) on delete cascade,
  project_user_id uuid references protodb_admin.project_auth_users(id) on delete set null,
  purpose text not null check (purpose in ('verify', 'recovery')),
  to_email text not null,
  subject text not null,
  body_text text not null,
  body_html text not null,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists project_auth_email_outbox_pending_idx
  on protodb_admin.project_auth_email_outbox(project_id, sent_at)
  where sent_at is null;
