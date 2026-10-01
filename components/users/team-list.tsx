"use client";

import { useState } from "react";
import { MoreHorizontal, UserX, UserCheck, Trash2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { timeAgo, type TeamMember } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const ROLES: TeamMember["role"][] = ["Owner", "Admin", "Editor", "Viewer"];

const STATUS_TONE: Record<TeamMember["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  invited: "warning",
  suspended: "neutral",
};

/** `lastActive` carries a literal "—" for members who've never signed in (seed data) rather than a real timestamp -- timeAgo() would produce "NaN d ago" if given that directly. */
function formatLastActive(value: string): string {
  if (value === "—" || Number.isNaN(new Date(value).getTime())) return "Never";
  return timeAgo(value);
}

export function TeamList({
  members,
  currentUserId,
  onChangeRole,
  onToggleSuspend,
  onRemove,
}: {
  members: TeamMember[];
  currentUserId: string;
  onChangeRole: (id: string, role: TeamMember["role"]) => void;
  onToggleSuspend: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  return (
    <div className="divide-y divide-border">
      {members.map((member) => {
        const isSelf = member.id === currentUserId;
        const isOwner = member.role === "Owner";
        return (
          <div key={member.id} className="flex items-center gap-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent">
              {member.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm text-ink">
                {member.name}
                {isSelf && <span className="text-xs text-ink-faint">(you)</span>}
                {isOwner && <ShieldCheck className="h-3.5 w-3.5 text-accent" />}
              </p>
              <p className="truncate text-xs text-ink-faint">{member.email}</p>
            </div>

            <select
              value={member.role}
              disabled={isOwner || isSelf}
              onChange={(e) => onChangeRole(member.id, e.target.value as TeamMember["role"])}
              className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-ink disabled:opacity-50 focus:border-accent-line focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <Badge tone={STATUS_TONE[member.status]} dot className="w-20 justify-center">
              {member.status}
            </Badge>

            <span className="hidden w-24 shrink-0 text-right text-xs text-ink-faint sm:block">
              {formatLastActive(member.lastActive)}
            </span>

            <div className="relative">
              <button
                onClick={() => setMenuOpenId((v) => (v === member.id ? null : member.id))}
                disabled={isOwner || isSelf}
                aria-label={`Actions for ${member.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-hover hover:text-ink disabled:opacity-30"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpenId === member.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                  <div className="glass absolute right-0 top-9 z-50 w-44 rounded-xl border border-border-strong bg-surface-raised p-1.5 shadow-raised">
                    <button
                      onClick={() => {
                        onToggleSuspend(member.id);
                        setMenuOpenId(null);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-white/[0.05]"
                    >
                      {member.status === "suspended" ? (
                        <>
                          <UserCheck className="h-3.5 w-3.5 text-ink-faint" />
                          Reactivate
                        </>
                      ) : (
                        <>
                          <UserX className="h-3.5 w-3.5 text-ink-faint" />
                          Suspend
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setRemoveTarget(member);
                        setMenuOpenId(null);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger hover:bg-danger-soft"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name}?`}
        description="They'll lose access to this workspace immediately. This can't be undone."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (removeTarget) onRemove(removeTarget.id);
          setRemoveTarget(null);
        }}
      />
    </div>
  );
}
