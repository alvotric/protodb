"use client";

import { useEffect, useState } from "react";
import { KeyRound, RotateCcw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamList } from "@/components/users/team-list";
import { InviteModal } from "@/components/users/invite-modal";
import { PermissionMatrix } from "@/components/users/permission-matrix";
import { RoleCapabilities } from "@/components/users/role-capabilities";
import { RlsPolicyViewer } from "@/components/users/rls-policy-viewer";
import {
  changeDemoMemberRole,
  changeDemoPermission,
  createDemoInvitation,
  createInitialDemoWorkspaceState,
  DEMO_CURRENT_USER_ID,
  DEMO_MODE_COPY,
  DEMO_RLS_TABLES,
  getDemoViewState,
  removeDemoMember,
  toggleDemoMemberStatus,
  type DemoInvitation,
  type DemoPermissionLevel,
  type DemoResourcePermission,
  type DemoTeamMember,
} from "@/lib/users/phase8-demo";
import type { AppRole } from "@/lib/auth/role-capabilities";

type ViewMode = "team" | "permissions" | "rls";

export function UsersWorkspace() {
  const [initialDemoState] = useState(createInitialDemoWorkspaceState);
  const [mode, setMode] = useState<ViewMode>("team");
  const [members, setMembers] = useState<DemoTeamMember[]>(() => initialDemoState.members);
  const [invitations, setInvitations] = useState<DemoInvitation[]>(() => initialDemoState.invitations);
  const [permissions, setPermissions] = useState<DemoResourcePermission[]>(() => initialDemoState.permissions);
  const [selectedMemberId, setSelectedMemberId] = useState(initialDemoState.selectedMemberId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadGeneration, setLoadGeneration] = useState(0);
  const workspaceState = getDemoViewState(loading, demoError, [mode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setLoading(false));
    return () => window.cancelAnimationFrame(frame);
  }, [loadGeneration]);

  function showFailure(error: string) {
    setNotice(null);
    setDemoError(error);
  }

  function handleInvite(email: string, role: Parameters<typeof createDemoInvitation>[1]): string | null {
    const result = createDemoInvitation(email, role, members, invitations, `demo-invite-${Date.now()}`, new Date().toISOString());
    if (!result.ok) return result.error;
    setInvitations((previous) => [...previous, result.value]);
    setNotice("Demo invitation created locally. No email was sent and no account was created.");
    setDemoError(null);
    return null;
  }

  function handleChangeRole(memberId: string, role: AppRole) {
    const result = changeDemoMemberRole(members, DEMO_CURRENT_USER_ID, memberId, role);
    if (!result.ok) {
      showFailure(result.error);
      return;
    }
    setMembers(result.value);
    setPermissions((previous) => previous.map((permission) =>
      permission.memberId === memberId ? { ...permission, role } : permission
    ));
    setNotice("Demo role changed in local session state only; real access rules are unchanged.");
    setDemoError(null);
  }

  function handleToggleSuspend(memberId: string) {
    const member = members.find((candidate) => candidate.id === memberId);
    const result = toggleDemoMemberStatus(members, DEMO_CURRENT_USER_ID, memberId);
    if (!result.ok) {
      showFailure(result.error);
      return;
    }
    setMembers(result.value);
    setNotice(member?.status === "suspended"
      ? "Demo member reactivated locally; no real account was changed."
      : "Demo member suspended locally; no real session was revoked.");
    setDemoError(null);
  }

  function handleRemove(memberId: string) {
    const result = removeDemoMember(members, DEMO_CURRENT_USER_ID, memberId);
    if (!result.ok) {
      showFailure(result.error);
      return;
    }
    setMembers(result.value);
    setPermissions((previous) => previous.filter((permission) => permission.memberId !== memberId));
    if (selectedMemberId === memberId) setSelectedMemberId(result.value[0]?.id ?? "");
    setNotice("Demo member removed from local session state only; no real account or sessions were deleted.");
    setDemoError(null);
  }

  function handlePermissionChange(permissionId: string, level: DemoPermissionLevel) {
    const result = changeDemoPermission(permissions, permissionId, level);
    if (!result.ok) {
      showFailure(result.error);
      return;
    }
    setPermissions(result.value);
    setNotice("Demo resource permission changed locally only; this does not grant or restrict application access.");
    setDemoError(null);
  }

  function resetDemo() {
    const initialState = createInitialDemoWorkspaceState();
    setLoading(true);
    setDemoError(null);
    setNotice("Phase 8 demo state was reset for this session.");
    setMembers(initialState.members);
    setInvitations(initialState.invitations);
    setPermissions(initialState.permissions);
    setSelectedMemberId(initialState.selectedMemberId);
    setLoadGeneration((generation) => generation + 1);
  }

  return (
    <div className="space-y-4">
      <Card className="border-warning/25 bg-warning/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">{DEMO_MODE_COPY.title}</h2>
              <Badge tone="warning">{DEMO_MODE_COPY.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {DEMO_MODE_COPY.warning}
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              {DEMO_MODE_COPY.identityNote}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={resetDemo}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset demo
          </Button>
        </div>
      </Card>

      {notice && <p role="status" aria-live="polite" className="rounded-lg border border-accent-line bg-accent-soft px-3 py-2 text-xs text-accent">{notice}</p>}

      {workspaceState.kind === "error" ? (
        <ErrorState
          title="Could not update demo state"
          description={workspaceState.message}
          action={<Button variant="secondary" size="sm" onClick={resetDemo}>Reset demo and retry</Button>}
        />
      ) : workspaceState.kind === "loading" ? (
        <div role="status" aria-live="polite" aria-label="Loading Phase 8 demo data" className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <p className="text-center text-xs text-ink-faint">Preparing session-local demo data…</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              items={[
                { value: "team", label: "Team", count: members.length },
                { value: "permissions", label: "Permissions" },
                { value: "rls", label: "Row-Level Security" },
              ]}
              value={mode}
              onChange={(value) => {
                if (value === "team" || value === "permissions" || value === "rls") setMode(value);
              }}
            />
            {mode === "team" && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                Create demo invitation
              </Button>
            )}
          </div>

          {mode === "team" && (
            <Card className="px-4">
              <TeamList
                members={members}
                invitations={invitations}
                currentUserId={DEMO_CURRENT_USER_ID}
                onChangeRole={handleChangeRole}
                onToggleSuspend={handleToggleSuspend}
                onRemove={handleRemove}
                onCancelAction={() => {
                  setDemoError(null);
                  setNotice("Demo action cancelled; no local changes were made.");
                }}
              />
              {members.length === 0 && invitations.length === 0 && (
                <div className="pb-4 text-center">
                  <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5" />
                    Create demo invitation
                  </Button>
                </div>
              )}
            </Card>
          )}

          {mode === "permissions" && (
            <>
              {members.length === 0 ? (
                <Card className="p-1">
                  <EmptyState icon={KeyRound} title="No demo members to scope" description="Reset the demo to restore sample members and resource permissions." />
                </Card>
              ) : (
                <PermissionMatrix
                  members={members}
                  permissions={permissions}
                  selectedMemberId={selectedMemberId}
                  onSelectMember={setSelectedMemberId}
                  onChange={handlePermissionChange}
                />
              )}
              <RoleCapabilities />
            </>
          )}

          {mode === "rls" && <RlsPolicyViewer tables={DEMO_RLS_TABLES} />}
        </>
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCancel={() => setNotice("Demo invitation cancelled; no local invitation was created.")}
        onInvite={handleInvite}
      />
    </div>
  );
}
