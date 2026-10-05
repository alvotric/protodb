-- Google OAuth/OIDC provider identity mapping (NOT YET APPLIED — do not
-- run against production until the Google login code path is deployed and
-- GOOGLE_* environment variables are configured).
--
-- The existing `protodb_admin.users` table is intentionally untouched:
-- password login keeps working exactly as before. Google's stable subject
-- identifier (`sub`) is the permanent identity key — never the mutable
-- email or display name. Email is stored lowercased for audit/debug only.
--
-- Mapping rules enforced by the application (not by triggers here):
-- - a Google subject may link to at most one user (unique provider+sub);
-- - a user may link at most one Google identity (unique provider+user);
-- - email matches alone NEVER merge accounts; linking an existing
--   password account requires an authenticated "Connect Google" action.

create table if not exists protodb_admin.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references protodb_admin.users(id) on delete cascade,
  provider text not null check (provider = 'google'),
  provider_sub text not null,
  email text,
  created_at timestamptz not null default now(),
  unique (provider, provider_sub),
  unique (provider, user_id)
);

create index if not exists user_identities_user_id_idx
  on protodb_admin.user_identities(user_id);
