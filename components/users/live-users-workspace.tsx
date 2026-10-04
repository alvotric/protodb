"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, UserCheck, Users, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_ROLES, type AppRole, type AccountStatus } from "@/lib/auth/role-capabilities";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  status: AccountStatus;
  createdAt: string;
  lastActiveAt: string | null;
};

type RlsTable = {
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
};

function apiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error &&
        typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
  }
  return fallback;
}

export function LiveUsersWorkspace({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [rlsTables, setRlsTables] = useState<RlsTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AppRole>>({});
  const [retry, setRetry] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    // Avoid flashing the whole roster skeleton on background refresh:
    // only show the skeleton on first load, otherwise keep existing rows.
    setUsers((current) => {
      if (current.length === 0) setLoading(true);
      return current;
    });
    setError(null);
    try {
      const [usersResponse, rlsResponse] = await Promise.all([
        fetch("/api/users", { cache: "no-store", signal }),
        fetch("/api/users/rls", { cache: "no-store", signal }),
      ]);
      const [usersPayload, rlsPayload] = await Promise.all([
        usersResponse.json().catch(() => null),
        rlsResponse.json().catch(() => null),
      ]);
      if (!usersResponse.ok) throw new Error(apiError(usersPayload, "The live user roster is unavailable."));
      if (!rlsResponse.ok) throw new Error(apiError(rlsPayload, "PostgreSQL RLS metadata is unavailable."));
      if (!usersPayload || usersPayload.ok !== true || !Array.isArray(usersPayload.users) ||
          !rlsPayload || rlsPayload.ok !== true || !Array.isArray(rlsPayload.tables)) {
        throw new Error("The user-management API returned invalid data.");
      }
      if (!signal.aborted) {
        setUsers(usersPayload.users as UserRow[]);
        setRlsTables(rlsPayload.tables as RlsTable[]);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "User management is unavailable.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  async function updateUser(user: UserRow, change: { role?: AppRole; status?: "active" | "suspended" }) {
    setBusyId(user.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "The account could not be updated."));
      setNotice(`${user.name}'s account was updated.`);
      // Clear a satisfied role draft so the Save button disappears.
      if (change.role !== undefined) {
        setRoleDrafts((previous) => {
          const next = { ...previous };
          delete next[user.id];
          return next;
        });
      }
      setRetry((value) => value + 1);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "The account could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div role="status" aria-label="Loading live users" className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-36 w-full" /></div>;
  }
  if (error) {
    return <ErrorState title="Live user management unavailable" description={error} action={<Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button>} />;
  }

  return (
    <div className="space-y-4">
      <Card className="border-accent-line bg-accent-soft/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Live Users &amp; Roles</h2>
            <p className="mt-1 text-xs text-ink-muted">Source: protodb_admin.users. Owner-only management; changes are enforced by the server and database.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
        </div>
      </Card>

      {notice && <p role="status" aria-live="polite" className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink-muted">{notice}</p>}

      <Card className="px-4">
        <CardHeader>
          <div><CardTitle>Team members</CardTitle><CardDescription>Suspending a user makes existing DB-backed sessions unusable. Removal and invitations are unavailable until their account/email flows are defined.</CardDescription></div>
        </CardHeader>
        {users.length === 0 ? <EmptyState icon={Users} title="No accounts found" description="Create the first Owner through the setup flow." className="py-8" /> : (
          <div className="divide-y divide-border">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const activeOwners = users.filter((candidate) => candidate.role === "Owner" && candidate.status === "active").length;
              const isFinalActiveOwner = user.role === "Owner" && user.status === "active" && activeOwners <= 1;
              const roleDraft = roleDrafts[user.id] ?? user.role;
              const isDemotingFinalOwner = isFinalActiveOwner && roleDraft !== "Owner";
              const isSuspendingFinalOwner = isFinalActiveOwner && user.status === "active";
              return (
                <div key={user.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent" aria-hidden="true">
                    {user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm text-ink">{user.name}{user.role === "Owner" && <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-label="Owner role" />}</p>
                    <p className="truncate text-xs text-ink-faint">{user.email}</p>
                  </div>
                  <Badge tone={user.status === "active" ? "success" : user.status === "invited" ? "warning" : "neutral"} dot>{user.status}</Badge>
                  <label className="sr-only" htmlFor={`live-role-${user.id}`}>Role for {user.name}</label>
                  <select
                    id={`live-role-${user.id}`}
                    value={roleDraft}
                    disabled={isSelf || busyId === user.id}
                    onChange={(event) => setRoleDrafts((previous) => ({ ...previous, [user.id]: event.target.value as AppRole }))}
                    className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-ink disabled:opacity-50"
                  >
                    {APP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  {roleDraft !== user.role && (
                    <Button
                      size="sm"
                      disabled={busyId !== null || isDemotingFinalOwner}
                      title={isDemotingFinalOwner ? "At least one active Owner must remain. The server also enforces this." : undefined}
                      onClick={() => void updateUser(user, { role: roleDraft })}
                    >
                      Save role
                    </Button>
                  )}
                  {!isSelf && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId !== null || isSuspendingFinalOwner}
                      title={isFinalActiveOwner ? "At least one active Owner must remain." : undefined}
                      onClick={() => void updateUser(user, { status: user.status === "suspended" ? "active" : "suspended" })}
                    >
                      {user.status === "suspended" ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                      {user.status === "suspended" ? "Reactivate" : "Suspend"}
                    </Button>
                  )}
                  {isSelf && <Badge tone="accent">You</Badge>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="px-4 pb-4">
        <CardHeader>
          <div><CardTitle>Database row-level security</CardTitle><CardDescription>Read-only PostgreSQL catalog metadata visible to the configured database connection. It does not describe ProtoDB application roles.</CardDescription></div>
        </CardHeader>
        {rlsTables.length === 0 ? <p className="py-4 text-sm text-ink-muted">No RLS-enabled tables are visible in the inspected schemas.</p> : (
          <div className="space-y-3">
            {rlsTables.map((table) => (
              <div key={`${table.schema}.${table.table}`} className="rounded-lg border border-border bg-surface px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-ink">{table.schema}.{table.table}</span>
                  {table.enabled && <Badge tone="success">RLS enabled</Badge>}
                  {table.forced && <Badge tone="warning">FORCE RLS</Badge>}
                  <span className="text-xs text-ink-faint">{table.policies.length} visible policies</span>
                </div>
                {table.policies.length === 0 ? <p className="mt-2 text-xs text-ink-faint">No policies are visible to this connection.</p> : (
                  <div className="mt-2 space-y-2">
                    {table.policies.map((policy) => (
                      <div key={policy.name} className="border-t border-border pt-2 text-xs text-ink-muted">
                        <p><span className="font-medium text-ink">{policy.name}</span> · {policy.command} · {policy.permissive ? "permissive" : "restrictive"} · {policy.roles.join(", ") || "PUBLIC"}</p>
                        {policy.using && <p className="mt-1 break-all"><span className="text-ink-faint">USING:</span> {policy.using}</p>}
                        {policy.withCheck && <p className="mt-1 break-all"><span className="text-ink-faint">WITH CHECK:</span> {policy.withCheck}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-faint">Catalog visibility depends on PostgreSQL grants; missing rows do not prove no policies exist.</p>
      </Card>
    </div>
  );
}
