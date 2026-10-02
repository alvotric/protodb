-- Phase 6 query history. SQL text is retained only for the owning
-- authenticated user and pruned to the latest 100 executions.
create table if not exists protodb_admin.query_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references protodb_admin.users(id) on delete cascade,
  sql text not null,
  status text not null check (status in ('success', 'error')),
  row_count integer,
  duration_ms integer not null check (duration_ms >= 0),
  error_message text,
  error_position integer,
  created_at timestamptz not null default now()
);

create index if not exists query_history_user_recent_idx
  on protodb_admin.query_history(user_id, created_at desc, id desc);
