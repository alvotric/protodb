"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { AuditLogTable } from "@/components/audit/audit-log-table";
import { SystemHealthPanel } from "@/components/audit/system-health-panel";

type ViewMode = "trail" | "health";

export function AuditWorkspace() {
  const [mode, setMode] = useState<ViewMode>("trail");

  return (
    <div>
      <div className="mb-4">
        <Tabs
          items={[
            { value: "trail", label: "Audit Trail" },
            { value: "health", label: "System Health" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as ViewMode)}
        />
      </div>

      {mode === "trail" ? <AuditLogTable /> : <SystemHealthPanel />}
    </div>
  );
}
