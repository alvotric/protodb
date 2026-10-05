"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, UserCheck, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";

export interface ProjectEndUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  status: "active" | "suspended";
}

function apiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
  }
  return fallback;
}

export function ProjectUsersSection({ projectId, onCountChange }: { projectId: string; onCountChange?: (count: number) => void }) {
  const [users, setUsers] = useState<ProjectEndUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/users`, { cache: "no-store", signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Project users could not be loaded."));
      if (!payload || typeof payload !== "object" || !("users" in payload) || !Array.isArray((payload as { users: unknown }).users)) {
        throw new Error("The project users API returned invalid data.");
      }
      if (!signal.aborted) {
        const list = (payload as { users: ProjectEndUser[] }).users;
        setUsers(list);
        onCountChange?.(list.length);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Project users could not be loaded.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  async function updateStatus(user: ProjectEndUser, status: "active" | "suspended") {
    setBusyId(user.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "The account could not be updated."));
      setNotice(`${user.email} is now ${status === "active" ? "active" : "suspended"}.`);
      setRetry((value) => value + 1);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "The account could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading project users" className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Project users unavailable"
        description={error}
        action={<Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button>}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {notice
          ? <p role="status" aria-live="polite" className="text-xs text-ink-muted">{notice}</p>
          : <p className="text-xs text-ink-faint">End users of the external app. Separate from ProtoDB admin accounts.</p>}
        <Button size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </Button>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No project users yet"
          description="Users appear here after their first Google sign-in through this project."
        />
      ) : (
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Verified</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell><span className="sr-only">Actions</span></TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell mono>{user.email}</TableCell>
                <TableCell>{user.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge tone={user.emailVerified ? "success" : "warning"} dot>
                    {user.emailVerified ? "Verified" : "Unverified"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge tone={user.status === "active" ? "success" : "neutral"} dot>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId !== null}
                    onClick={() => void updateStatus(user, user.status === "suspended" ? "active" : "suspended")}
                  >
                    {busyId === user.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : user.status === "suspended"
                        ? <UserCheck className="h-3.5 w-3.5" />
                        : <UserX className="h-3.5 w-3.5" />}
                    {user.status === "suspended" ? "Reactivate" : "Suspend"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
