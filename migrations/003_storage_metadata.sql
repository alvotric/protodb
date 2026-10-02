-- Phase 7 storage metadata. File bytes remain in the configured
-- S3-compatible provider; PostgreSQL stores metadata and quota reservations.
create table if not exists protodb_admin.storage_buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_name text not null,
  is_public boolean not null default false,
  size_limit_bytes bigint check (size_limit_bytes is null or size_limit_bytes >= 0),
  created_by uuid references protodb_admin.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists storage_buckets_name_lower_unique
  on protodb_admin.storage_buckets (lower(name));

create table if not exists protodb_admin.storage_objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references protodb_admin.storage_buckets(id) on delete restrict,
  storage_key text not null unique,
  display_name text not null,
  folder_path text not null default '',
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  etag text,
  checksum text,
  uploaded_by uuid references protodb_admin.users(id) on delete set null,
  state text not null default 'ready' check (state in ('ready', 'deleting')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, bucket_id)
);

create unique index if not exists storage_objects_bucket_folder_name_unique
  on protodb_admin.storage_objects (bucket_id, folder_path, lower(display_name));

create index if not exists storage_objects_bucket_folder_recent_idx
  on protodb_admin.storage_objects (bucket_id, folder_path, updated_at desc, id)
  where state = 'ready';

create table if not exists protodb_admin.storage_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references protodb_admin.storage_buckets(id) on delete restrict,
  user_id uuid not null references protodb_admin.users(id) on delete cascade,
  storage_key text not null unique,
  display_name text not null,
  folder_path text not null default '',
  content_type text not null,
  declared_size_bytes bigint not null check (declared_size_bytes >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'finalizing', 'cleanup')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists storage_upload_reservations_bucket_active_idx
  on protodb_admin.storage_upload_reservations (bucket_id, expires_at)
  where status in ('pending', 'finalizing');

create index if not exists storage_upload_reservations_expired_idx
  on protodb_admin.storage_upload_reservations (expires_at)
  where status in ('pending', 'finalizing', 'cleanup');
