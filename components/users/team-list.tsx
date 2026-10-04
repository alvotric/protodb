"use client";

import { useState } from "react";
import { MoreHorizontal, UserX, UserCheck, Trash2, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { timeAgo } from "@/lib/time";
import { APP_ROLES, type AppRole } from "@/lib/auth/role-capabilities";
import type { DemoInvitation, DemoTeamMember } from "@/lib/users/phase8-demo";

const ASSIGNABLE_ROLES = APP_ROLES.filter((role) => role !== "Owner");
type PendingAction = { kind: "suspend" | "remove"; member: DemoTeamMember } | null;

const STATUS_TONE: Record<DemoTeamMember["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  invited: "warning",
  suspended: "neutral",
};

function formatLastActive(value: string | null): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Never";
  return timeAgo(value);
}

export function TeamList({
  members,
  invitations,
  currentUserId,
  onChangeRole,
  onToggleSuspend,
  onRemove,
  onCancelAction,
}: {
  members: DemoTeamMember[];
  invitations: DemoInvitation[];
  currentUserId: string;
  onChangeRole: (id: string, role: AppRole) => void;
  onToggleSuspend: (id: string) => void;
  onRemove: (id: string) => void;
  onCancelAction: () => void;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  return (
    <div className="divide-y divide-border">
      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No demo team members"
          description="The local demo roster is empty. Create a demo invitation to explore the workflow."
          className="py-10"
        />
      ) : members.map((member) => {
        const isDemoIdentity = member.id === currentUserId;
        const isOwner = member.role === "Owner";
        const isFinalOwner = isOwner && members.filter((candidate) => candidate.role === "Owner").length <= 1;
        const roleOptions = isOwner ? APP_ROLES : ASSIGNABLE_ROLES;
        return (
          <div key={member.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent" aria-hidden="true">
              {member.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm text-ink">
                {member.name}
                {isDemoIdentity && <Badge tone="accent">Demo identity</Badge>}
                {isOwner && <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-label="Owner role" />}
              </p>
              <p className="truncate text-xs text-ink-faint">{member.email}</p>
            </div>

            <label className="sr-only" htmlFor={`demo-role-${member.id}`}>Demo role for {member.name}</label>
            <select
              id={`demo-role-${member.id}`}
              value={member.role}
              disabled={isOwner || isDemoIdentity}
              onChange={(event) => {
                const nextRole = APP_ROLES.find((role) => role === event.target.value);
                if (nextRole) onChangeRole(member.id, nextRole);
              }}
              className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-ink disabled:opacity-50 focus:border-accent-line focus:outline-none"
            >
              {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>

            <Badge tone={STATUS_TONE[member.status]} dot className="w-20 justify-center">{member.status}</Badge>
            <span className="hidden w-24 shrink-0 text-right text-xs text-ink-faint sm:block">
              {formatLastActive(member.lastActive)}
            </span>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpenId((value) => value === member.id ? null : member.id)}
                disabled={isDemoIdentity || isOwner || isFinalOwner}
                aria-label={`Demo actions for ${member.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-hover hover:text-ink disabled:opacity-30"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpenId === member.id && (
                <>
                  <button type="button" aria-label="Close member actions" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpenId(null)} />
                  <div className="glass absolute right-0 top-9 z-50 w-44 rounded-xl border border-border-strong bg-surface-raised p-1.5 shadow-raised">
                    {member.status === "suspended" ? (
                      <button
                        type="button"
                        onClick={() => { onToggleSuspend(member.id); setMenuOpenId(null); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-surface-hover"
                      >
                        <UserCheck className="h-3.5 w-3.5 text-ink-faint" />
                        Reactivate (demo)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setPendingAction({ kind: "suspend", member }); setMenuOpenId(null); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-surface-hover"
                      >
                        <UserX className="h-3.5 w-3.5 text-ink-faint" />
                        Suspend (demo)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setPendingAction({ kind: "remove", member }); setMenuOpenId(null); }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger hover:bg-danger-soft"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove (demo)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      {invitations.length > 0 && (
        <section className="py-4" aria-labelledby="demo-invitations-heading">
          <div className="mb-3 flex items-center gap-2">
            <h3 id="demo-invitations-heading" className="text-sm font-medium text-ink">Pending demo invitations</h3>
            <Badge tone="warning">{invitations.length}</Badge>
          </div>
          <div className="space-y-2">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{invitation.email}</span>
                <span className="text-xs text-ink-muted">{invitation.role}</span>
                <Badge tone="warning">Local only</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && pendingAction) {
            setPendingAction(null);
            onCancelAction();
          }
        }}
        title={pendingAction?.kind === "remove" ? `Remove ${pendingAction.member.name} from demo?` : `Suspend ${pendingAction?.member.name}?`}
        description={pendingAction?.kind === "remove"
          ? "This removes only the local demo member from this browser session. It does not remove an account."
          : "This changes only the local demo status. It does not suspend or revoke access for a real account."}
        confirmLabel={pendingAction?.kind === "remove" ? "Remove demo member" : "Suspend demo member"}
        destructive
        onConfirm={() => {
          if (pendingAction?.kind === "remove") onRemove(pendingAction.member.id);
          if (pendingAction?.kind === "suspend") onToggleSuspend(pendingAction.member.id);
          setPendingAction(null);
        }}
      />
    </div>
  );
}
