"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { TeamList } from "@/components/users/team-list";
import { InviteModal } from "@/components/users/invite-modal";
import { PermissionMatrix } from "@/components/users/permission-matrix";
import { RlsPolicyViewer } from "@/components/users/rls-policy-viewer";
import { teamMembers as seedMembers, defaultPermissions, type TeamMember, type PermissionLevel } from "@/lib/mock-data";

type ViewMode = "team" | "permissions" | "rls";

/**
 * Phase 8 — Users, Roles & Permissions.
 * All three views share one page; only Team has its own header
 * action (Invite) since Permissions/RLS aren't create-flows. Member
 * list, roles, and permission overrides all live in component state
 * for the session -- same honesty as every other phase (Phase 10 is
 * what makes any of this persist against a real `auth.users` table).
 */
export function UsersWorkspace({ currentUserEmail }: { currentUserEmail: string }) {
  const [mode, setMode] = useState<ViewMode>("team");
  const [members, setMembers] = useState<TeamMember[]>(seedMembers);
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [inviteOpen, setInviteOpen] = useState(false);

  const currentUserId = members.find((m) => m.email === currentUserEmail)?.id ?? members[0]?.id ?? "";

  function handleInvite(email: string, role: TeamMember["role"]) {
    setMembers((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, name: email.split("@")[0], email, role, status: "invited", lastActive: "—" },
    ]);
  }

  function handleChangeRole(id: string, role: TeamMember["role"]) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
  }

  function handleToggleSuspend(id: string) {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: m.status === "suspended" ? "active" : "suspended" } : m))
    );
  }

  function handleRemove(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function handlePermissionChange(resource: string, role: "editor" | "viewer", level: PermissionLevel) {
    setPermissions((prev) => prev.map((p) => (p.resource === resource ? { ...p, [role]: level } : p)));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { value: "team", label: "Team", count: members.length },
            { value: "permissions", label: "Permissions" },
            { value: "rls", label: "Row-Level Security" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as ViewMode)}
        />
        {mode === "team" && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Invite
          </Button>
        )}
      </div>

      {mode === "team" && (
        <Card className="px-4">
          <TeamList
            members={members}
            currentUserId={currentUserId}
            onChangeRole={handleChangeRole}
            onToggleSuspend={handleToggleSuspend}
            onRemove={handleRemove}
          />
        </Card>
      )}

      {mode === "permissions" && <PermissionMatrix permissions={permissions} onChange={handlePermissionChange} />}

      {mode === "rls" && <RlsPolicyViewer />}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={handleInvite} />
    </div>
  );
}
