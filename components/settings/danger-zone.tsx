"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DangerZoneSection() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  return (
    <Card className="border-danger/25">
      <CardHeader>
        <div>
          <CardTitle className="text-danger">Danger zone</CardTitle>
          <CardDescription>Destructive actions that can&apos;t be undone.</CardDescription>
        </div>
      </CardHeader>
      <div className="flex items-center justify-between border-t border-danger/20 px-4 py-4">
        <div>
          <p className="text-sm text-ink">Delete this workspace</p>
          <p className="text-xs text-ink-faint">Removes every table, bucket, and team member permanently.</p>
        </div>
        {deleted ? (
          <p className="text-xs text-ink-faint">This is a UI preview -- nothing was actually deleted.</p>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
            Delete workspace
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this workspace?"
        description="This is a UI preview with no real backend (Phase 10 adds one) -- confirming here won't actually delete anything, but this is exactly how the real flow will feel."
        confirmLabel="Delete workspace"
        destructive
        onConfirm={() => {
          setDeleted(true);
          setConfirmOpen(false);
        }}
      />
    </Card>
  );
}
