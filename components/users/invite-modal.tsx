"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DEMO_INVITABLE_ROLES, type DemoInvitationRole } from "@/lib/users/phase8-demo";

export function InviteModal({
  open,
  onClose,
  onCancel,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onCancel: () => void;
  onInvite: (email: string, role: DemoInvitationRole) => string | null;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DemoInvitationRole | "">("");
  const [error, setError] = useState<string | null>(null);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    if (open) {
      setEmail("");
      setRole("");
      setError(null);
    }
  }, [open]);

  function handleSubmit() {
    setError(null);
    if (!isValidEmail) {
      setError("Enter a valid email address.");
      return;
    }
    if (!role) {
      setError("Choose a role for this demo invitation.");
      return;
    }
    const failure = onInvite(email.trim(), role);
    if (failure) {
      setError(failure);
      return;
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a demo invitation"
      description="This adds a local demo entry only. No email is sent, no token is issued, and no account is created."
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => { onCancel(); onClose(); }}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!isValidEmail || !role}>Create demo invitation</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted" htmlFor="demo-invite-email">Email</label>
          <Input
            id="demo-invite-email"
            type="email"
            value={email}
            onChange={(event) => { setEmail(event.target.value); setError(null); }}
            placeholder="teammate@example.test"
            autoFocus
            aria-invalid={Boolean(error && !isValidEmail)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted" htmlFor="demo-invite-role">Role</label>
          <select
            id="demo-invite-role"
            value={role}
            onChange={(event) => {
              const next = DEMO_INVITABLE_ROLES.find((candidate) => candidate === event.target.value);
              setRole(next ?? "");
              setError(null);
            }}
            className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-accent-line focus:outline-none"
          >
            <option value="">Choose a role</option>
            {DEMO_INVITABLE_ROLES.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
