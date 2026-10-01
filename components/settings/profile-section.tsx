"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Phase 10 — Backend API & Real Data Integration.
 * `user` is the real signed-in session (lib/auth/session.ts), not
 * lib/mock-data.ts's static `currentUser`. Save is genuinely real
 * too -- PATCH /api/auth/profile updates `protodb_admin.users`
 * directly, then refreshes the page so the Topbar's name updates
 * along with it.
 */
export function ProfileSection({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Couldn't save changes.");
        return;
      }
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name and account details.</CardDescription>
        </div>
      </CardHeader>
      <div className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Email</label>
          <Input value={user.email} disabled />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Role</label>
          <Input value={user.role} disabled />
        </div>
      </div>
      {error && <p className="px-4 pb-2 text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        {saved && (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
        <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </Card>
  );
}
