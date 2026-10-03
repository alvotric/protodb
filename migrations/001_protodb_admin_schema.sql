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
