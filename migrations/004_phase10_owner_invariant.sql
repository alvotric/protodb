-- Phase 10: enforce the final active Owner invariant for upgraded databases.
-- Bootstrap and user-management mutations also take the same transaction
-- advisory lock before checking the invariant.

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

create or replace function protodb_admin.protect_users_truncate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, protodb_admin
as $$
begin
  raise exception 'Truncating protodb_admin.users is not permitted.'
    using errcode = '23514';
end;
$$;

drop trigger if exists protect_users_truncate on protodb_admin.users;
create trigger protect_users_truncate
before truncate on protodb_admin.users
for each statement execute function protodb_admin.protect_users_truncate();

create index if not exists audit_log_actor_at_idx on protodb_admin.audit_log(actor, at desc);
create index if not exists audit_log_action_at_idx on protodb_admin.audit_log(action, at desc);
create index if not exists audit_log_result_at_idx on protodb_admin.audit_log(result, at desc);
