"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { TeamMember } from "@/lib/mock-data";

const ROLES: TeamMember["role"][] = ["Admin", "Editor", "Viewer"];

export function InviteModal({
  open,
  onClose,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (email: string, role: TeamMember["role"]) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamMember["role"]>("Editor");
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function handleSubmit() {
    if (!isValid) return;
    onInvite(email.trim(), role);
    setEmail("");
    setRole("Editor");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a teammate"
      description="They'll show up as pending until they accept."
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!isValid}>
            Send invite
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Email</label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as TeamMember["role"])}
            className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-accent-line focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
