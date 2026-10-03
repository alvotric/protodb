"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { LiveUsersWorkspace } from "@/components/users/live-users-workspace";
import { UsersWorkspace } from "@/components/users/users-workspace";

export function UsersPageClient({ currentUserId }: { currentUserId: string }) {
  const [mode, setMode] = useState<"live" | "demo">("live");
  return (
    <div className="space-y-4">
      <Tabs
        items={[
          { value: "live", label: "Live users" },
          { value: "demo", label: "Phase 8 demo/reference" },
        ]}
        value={mode}
        onChange={(value) => { if (value === "live" || value === "demo") setMode(value); }}
      />
      {mode === "live" ? <LiveUsersWorkspace currentUserId={currentUserId} /> : <UsersWorkspace />}
    </div>
  );
}
