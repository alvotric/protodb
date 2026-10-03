"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WORKSPACE_DELETION_AVAILABLE } from "@/lib/settings/danger-zone-policy";

export function DangerZoneSection() {
  return (
    <Card className="border-danger/25">
      <CardHeader>
        <div>
          <CardTitle className="text-danger">Danger zone</CardTitle>
          <CardDescription>Workspace deletion is unavailable in this version.</CardDescription>
        </div>
      </CardHeader>
      <div className="flex items-center justify-between border-t border-danger/20 px-4 py-4">
        <div>
          <p className="text-sm text-ink">Delete workspace</p>
          <p className="text-xs text-ink-faint">
            {WORKSPACE_DELETION_AVAILABLE
              ? "Workspace deletion is available."
              : "No deletion endpoint is available. Database tables, buckets, and accounts will not be affected."}
          </p>
        </div>
        <Button variant="danger" size="sm" disabled={!WORKSPACE_DELETION_AVAILABLE} title={WORKSPACE_DELETION_AVAILABLE ? undefined : "Workspace deletion is unavailable"}>
          {WORKSPACE_DELETION_AVAILABLE ? "Delete workspace" : "Unavailable"}
        </Button>
      </div>
    </Card>
  );
}
