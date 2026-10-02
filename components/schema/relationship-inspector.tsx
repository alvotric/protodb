"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ForeignKeyRef } from "@/lib/mock-data";

export function RelationshipInspector({
  fk,
  onClose,
  onEdit,
  onRemove,
  removing = false,
  removeError,
}: {
  fk: ForeignKeyRef | null;
  onClose: () => void;
  onEdit?: () => void;
  onRemove?: () => Promise<boolean>;
  removing?: boolean;
  removeError?: string | null;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const pairs = fk?.columns ?? (fk ? [{ column: fk.column, refColumn: fk.refColumn }] : []);

  async function confirmRemoval() {
    const removed = await onRemove?.();
    if (removed) setConfirmRemove(false);
  }
  return (
    <Modal
      open={fk !== null}
      onClose={onClose}
      title="Foreign key relationship"
      size="sm"
      footer={<>
        {onRemove && fk?.constraintName && (
          <Button size="sm" variant="danger" disabled={removing} onClick={() => setConfirmRemove(true)}>
            Remove foreign key
          </Button>
        )}
        {onEdit && <Button size="sm" variant="secondary" onClick={onEdit}>Edit relationship</Button>}
        <Button size="sm" onClick={onClose}>Close</Button>
      </>}
    >
      {fk && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-center gap-3">
              <div className="text-center">
                <p className="font-mono text-sm text-ink">{fk.schema ? `${fk.schema}.${fk.table}` : fk.table}</p>
                {pairs.map((pair, index) => (
                  <p key={`${pair.column}.${index}`} className="font-mono text-xs text-ink-faint">{pair.column}</p>
                ))}
              </div>
              <Link2 className="h-4 w-4 shrink-0 text-accent" />
              <div className="text-center">
                <p className="font-mono text-sm text-ink">{fk.refSchema ? `${fk.refSchema}.${fk.refTable}` : fk.refTable}</p>
                {pairs.map((pair, index) => (
                  <p key={`${pair.refColumn}.${index}`} className="font-mono text-xs text-ink-faint">{pair.refColumn}</p>
                ))}
              </div>
            </div>
          </div>
          {fk.constraintName && <p className="text-xs text-ink-muted">Constraint: <span className="font-mono text-ink">{fk.constraintName}</span></p>}
          <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
            <p>On update: <span className="text-ink">{fk.onUpdate ?? "—"}</span></p>
            <p>On delete: <span className="text-ink">{fk.onDelete ?? "—"}</span></p>
          </div>
          {pairs.length > 1 && <p className="text-xs text-ink-faint">Composite relationships are shown as ordered column pairs; editing composite constraints is not supported here.</p>}
          {removeError && <p className="text-sm text-danger">{removeError}</p>}
          <ConfirmDialog
            open={confirmRemove}
            onOpenChange={setConfirmRemove}
            title={`Remove foreign key "${fk.constraintName}"?`}
            description="This removes the database constraint. Existing rows are not changed, but future writes will no longer be checked by this relationship."
            confirmLabel="Remove foreign key"
            destructive
            loading={removing}
            onConfirm={() => void confirmRemoval()}
          />
        </div>
      )}
    </Modal>
  );
}
