import { query, withTransaction } from "@/lib/db/client";
import type { PoolClient } from "pg";
import type { SessionUser } from "@/lib/auth/session";
import { canChangeMember, type UserAdminChange } from "@/lib/users/user-admin-policy";

const OWNER_INVARIANT_LOCK = [734091, 1] as const;

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: SessionUser["role"];
  status: SessionUser["status"];
  createdAt: string;
  lastActiveAt: string | null;
}

export interface RlsTableRecord {
  schema: string;
  table: string;
  enabled: boolean;
  forced: boolean;
  policies: {
    name: string;
    command: string;
    roles: string[];
    permissive: boolean;
    using: string | null;
    withCheck: string | null;
  }[];
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await query<{
    id: string;
    email: string;
    name: string;
    role: AdminUser["role"];
    status: AdminUser["status"];
    created_at: Date | string;
    last_active_at: Date | string | null;
  }>(
    `select id, email, name, role, status, created_at, last_active_at
     from protodb_admin.users
     order by created_at, id
     limit 500`
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    lastActiveAt: row.last_active_at ? new Date(row.last_active_at).toISOString() : null,
  }));
}

async function ensureAnotherActiveOwner(client: PoolClient, userId: string): Promise<void> {
  const owners = await client.query<{ exists: boolean }>(
    `select exists(
       select 1 from protodb_admin.users
       where id <> $1 and role = 'Owner' and status = 'active'
     ) as exists`,
    [userId]
  );
  if (!owners.rows[0]?.exists) throw new Error("final_owner_invariant");
}

export async function changeAdminUser(
  actor: Pick<SessionUser, "id">,
  targetId: string,
  change: UserAdminChange
): Promise<void> {
  if (!canChangeMember(actor.id, targetId)) throw new Error("self_change_denied");

  await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock($1, $2)", [...OWNER_INVARIANT_LOCK]);
    const result = await client.query<{
      id: string;
      role: SessionUser["role"];
      status: SessionUser["status"];
    }>(
      `select id, role, status from protodb_admin.users where id = $1 for update`,
      [targetId]
    );
    const target = result.rows[0];
    if (!target) throw new Error("user_not_found");

    const nextRole = change.role ?? target.role;
    const nextStatus = change.status ?? target.status;
    if (
      target.role === "Owner" &&
      target.status === "active" &&
      (nextRole !== "Owner" || nextStatus !== "active")
    ) {
      await ensureAnotherActiveOwner(client, targetId);
    }

    if (change.role !== undefined) {
      await client.query(`update protodb_admin.users set role = $1 where id = $2`, [change.role, targetId]);
    } else if (change.status !== undefined) {
      await client.query(`update protodb_admin.users set status = $1 where id = $2`, [change.status, targetId]);
    }
  });
}

export async function listRlsTables(): Promise<RlsTableRecord[]> {
  const rows = await query<{
    schema_name: string;
    table_name: string;
    enabled: boolean;
    forced: boolean;
    policy_name: string | null;
    command: string | null;
    roles: string[] | null;
    permissive: boolean | null;
    using_expression: string | null;
    check_expression: string | null;
  }>(
    `select n.nspname as schema_name, c.relname as table_name,
            c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
            p.policyname as policy_name, p.cmd as command, p.roles,
            p.permissive = 'PERMISSIVE' as permissive,
            p.qual as using_expression, p.with_check as check_expression
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
     where c.relkind in ('r', 'p')
       and n.nspname not in ('pg_catalog', 'information_schema', 'protodb_admin')
       and n.nspname not like 'pg\\_toast%'
       and (c.relrowsecurity or c.relforcerowsecurity)
     order by n.nspname, c.relname, p.policyname`
  );
  const byTable = new Map<string, RlsTableRecord>();
  for (const row of rows) {
    const key = `${row.schema_name}\u0000${row.table_name}`;
    let table = byTable.get(key);
    if (!table) {
      table = {
        schema: row.schema_name,
        table: row.table_name,
        enabled: row.enabled,
        forced: row.forced,
        policies: [],
      };
      byTable.set(key, table);
    }
    if (row.policy_name) {
      table.policies.push({
        name: row.policy_name,
        command: row.command ?? "ALL",
        roles: row.roles ?? [],
        permissive: row.permissive ?? true,
        using: row.using_expression,
        withCheck: row.check_expression,
      });
    }
  }
  return [...byTable.values()];
}
