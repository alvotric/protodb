-- ProtoDB Admin -- Phase 10 bootstrap migration.
--
-- Run this once against your own database:
--   psql "$DATABASE_URL" -f migrations/001_protodb_admin_schema.sql
--
-- Creates a dedicated `protodb_admin` schema for this app's own
-- bookkeeping (who can sign in, sessions, the audit trail, saved
-- queries, notification preferences) -- kept separate from `public`
-- and every other schema so administering a database never means
-- polluting it with this tool's own tables. Safe to re-run: every
-- statement is idempotent.

create schema if not exists protodb_admin;

-- gen_random_uuid() is built into Postgres 13+ core; this extension
-- keeps the same function available on older installations without
-- needing two different id-generation strategies.
create extension if not exists pgcrypto;

create table if not exists protodb_admin.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null default 'Viewer' check (role in ('Owner', 'Admin', 'Editor', 'Viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  last_active_at timestamptz
);

create or replace function protodb_admin.protect_final_active_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, protodb_admin
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'Owner' and old.status = 'active' then
      perform pg_advisory_xact_lock(734091, 1);
      if not exists (
        select 1 from protodb_admin.users
        where id <> old.id and role = 'Owner' and status = 'active'
      ) then
        raise exception 'At least one active Owner must remain.'
          using errcode = '23514';
      end if;
    end if;
    return old;
  end if;
  if old.role = 'Owner' and old.status = 'active' and
     (new.role <> 'Owner' or new.status <> 'active') then
    perform pg_advisory_xact_lock(734091, 1);
    if not exists (
      select 1 from protodb_admin.users
      where id <> old.id and role = 'Owner' and status = 'active'
    ) then
      raise exception 'At least one active Owner must remain.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_final_active_owner on protodb_admin.users;
create trigger protect_final_active_owner
before update of role, status or delete on protodb_admin.users
for each row execute function protodb_admin.protect_final_active_owner();

create table if not exists protodb_admin.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references protodb_admin.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_id_idx on protodb_admin.sessions(user_id);
create index if not exists sessions_expires_at_idx on protodb_admin.sessions(expires_at);

create table if not exists protodb_admin.audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  resource text not null,
  result text not null check (result in ('success', 'failed')),
  ip text,
  at timestamptz not null default now()
);

create index if not exists audit_log_at_idx on protodb_admin.audit_log(at desc);
create index if not exists audit_log_actor_at_idx on protodb_admin.audit_log(actor, at desc);
create index if not exists audit_log_action_at_idx on protodb_admin.audit_log(action, at desc);
create index if not exists audit_log_result_at_idx on protodb_admin.audit_log(result, at desc);

create table if not exists protodb_admin.saved_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references protodb_admin.users(id) on delete cascade,
  name text not null,
  sql text not null,
  created_at timestamptz not null default now()
);

create table if not exists protodb_admin.notification_preferences (
  user_id uuid not null references protodb_admin.users(id) on delete cascade,
  event_id text not null,
  in_app boolean not null default true,
  email boolean not null default false,
  primary key (user_id, event_id)
);
