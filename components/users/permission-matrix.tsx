"use client";

import { useMemo } from "react";
import { Check, Pencil, Eye, Ban, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { DEMO_PERMISSION_LEVELS, type DemoPermissionLevel, type DemoResourcePermission, type DemoTeamMember } from "@/lib/users/phase8-demo";

const LEVEL_META: Record<DemoPermissionLevel, { icon: typeof Check; label: string; className: string }> = {
  full: { icon: Check, label: "Full", className: "text-success bg-success-soft" },
  edit: { icon: Pencil, label: "Edit", className: "text-accent bg-accent-soft" },
  view: { icon: Eye, label: "View", className: "text-warning bg-warning-soft" },
  none: { icon: Ban, label: "None", className: "text-ink-faint bg-surface-hover" },
};

export function PermissionMatrix({
  members,
  permissions,
  selectedMemberId,
  onSelectMember,
  onChange,
}: {
  members: DemoTeamMember[];
  permissions: DemoResourcePermission[];
  selectedMemberId: string;
  onSelectMember: (memberId: string) => void;
  onChange: (permissionId: string, level: DemoPermissionLevel) => void;
}) {
  const memberPermissions = useMemo(
    () => permissions.filter((permission) => permission.memberId === selectedMemberId),
    [permissions, selectedMemberId]
  );
  const selectedMember = members.find((member) => member.id === selectedMemberId);

  function cycle(current: DemoPermissionLevel): DemoPermissionLevel {
    const index = DEMO_PERMISSION_LEVELS.indexOf(current);
    return DEMO_PERMISSION_LEVELS[(index + 1) % DEMO_PERMISSION_LEVELS.length];
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink">Demo resource permissions</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Session-local examples scoped to a member and a schema, table, or bucket. Levels are illustrative only and do not change server-enforced access.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Member
          <select
            aria-label="Select demo member for resource permissions"
            value={selectedMemberId}
            onChange={(event) => onSelectMember(event.target.value)}
            className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-ink focus:border-accent-line focus:outline-none"
          >
            {members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}
          </select>
        </label>
      </div>

      {!selectedMember || memberPermissions.length === 0 ? (
        <Card className="p-1">
          <EmptyState
            icon={KeyRound}
            title="No demo resource permissions"
            description={selectedMember ? "No local permission examples are assigned to this member." : "Add demo members to explore resource-scoped examples."}
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-1">
          <div className="flex items-center gap-2 px-4 pt-3">
            <span className="text-sm text-ink">{selectedMember.name}</span>
            <Badge tone="accent">{selectedMember.role}</Badge>
          </div>
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted">Resource type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted">Resource identity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted">Member / role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted">Demo level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {memberPermissions.map((permission) => (
                <tr key={permission.id}>
                  <td className="px-4 py-2.5 capitalize text-ink-muted">{permission.type}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink">{permission.name}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-muted">{selectedMember.name} · {permission.role}</td>
                  <td className="px-4 py-2.5">
                    <LevelPill
                      level={permission.level}
                      onClick={() => onChange(permission.id, cycle(permission.level))}
                      label={`Change local demo permission for ${permission.name}, ${selectedMember.name}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function LevelPill({ level, onClick, label }: { level: DemoPermissionLevel; onClick: () => void; label: string }) {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      aria-label={label}
      title="Demo-only; not persisted or enforced"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", meta.className)}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </button>
  );
}
