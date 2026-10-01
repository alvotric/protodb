"use client";

import { Link2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { ForeignKeyRef } from "@/lib/mock-data";

export function RelationshipInspector({
  fk,
  onClose,
}: {
  fk: ForeignKeyRef | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={fk !== null}
      onClose={onClose}
      title="Foreign key relationship"
      size="sm"
      footer={
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {fk && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="text-center">
            <p className="font-mono text-sm text-ink">{fk.table}</p>
            <p className="font-mono text-xs text-ink-faint">{fk.column}</p>
          </div>
          <Link2 className="h-4 w-4 shrink-0 text-accent" />
          <div className="text-center">
            <p className="font-mono text-sm text-ink">{fk.refTable}</p>
            <p className="font-mono text-xs text-ink-faint">{fk.refColumn}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
