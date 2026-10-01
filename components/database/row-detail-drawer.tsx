"use client";

import { useEffect, useState } from "react";
import { KeyRound, Link2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ColumnValueEditor } from "@/components/database/column-value-editor";
import type { RealColumn } from "@/lib/database/schema-service";

type DetailColumn = Pick<RealColumn, "name" | "type" | "nullable"> & {
  default?: string | null;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isIdentity?: boolean;
  isGenerated?: boolean;
};

export function RowDetailDrawer<Row extends Record<string, unknown>>({
  open,
  onClose,
  tableName,
  columns,
  row,
  onSave,
  onCreate,
  mode = "edit",
  saving = false,
}: {
  open: boolean;
  onClose: () => void;
  tableName: string;
  columns: DetailColumn[];
  row: Row | null;
  onSave?: (next: Row) => void | Promise<void>;
  onCreate?: (values: Record<string, unknown>) => void | Promise<void>;
  mode?: "edit" | "create";
  saving?: boolean;
}) {
  const emptyRow = () =>
    Object.fromEntries(columns.map((column) => [column.name, undefined])) as Row;
  const [draft, setDraft] = useState<Row | null>(mode === "create" ? emptyRow() : row);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setDraft(mode === "create" ? emptyRow() : row);
      setTouched(new Set());
      setError(null);
    }
    // Reset only when opening/changing mode/row; columns are stable for a
    // selected table and should not reset user edits on ordinary renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row, mode]);

  if (!draft) return null;

  function closeWithoutSaving() {
    if (saving || submitting) return;
    setDraft(row);
    setError(null);
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={closeWithoutSaving}
      title="Row detail"
      description={mode === "create" ? `${tableName} · new row` : `${tableName} · every column, one place`}
    >
      <div className="space-y-4">
        {columns.map((column) => {
          const value = draft[column.name];
          const locked = Boolean(
            column.isIdentity ||
            column.isGenerated ||
            (mode === "edit" && column.isPrimaryKey)
          );
          return (
            <div key={column.name}>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                {column.isPrimaryKey && <KeyRound className="h-3 w-3 text-accent" />}
                {column.isForeignKey && <Link2 className="h-3 w-3 text-ink-faint" />}
                <span className="font-mono">{column.name}</span>
                <span className="text-ink-faint">· {column.type}</span>
              </label>
              <ColumnValueEditor
                column={column}
                value={value}
                disabled={locked || saving || submitting}
                onChange={(next) =>
                  {
                    setTouched((previous) => new Set(previous).add(column.name));
                    setDraft((previous) => (previous ? { ...previous, [column.name]: next } as Row : previous));
                  }
                }
              />
              {mode === "create" && !locked && (column.default !== null || column.nullable) && (
                <button
                  type="button"
                  disabled={saving || submitting}
                  onClick={() => {
                    setTouched((previous) => {
                      const next = new Set(previous);
                      next.delete(column.name);
                      return next;
                    });
                    setDraft((previous) => (previous ? { ...previous, [column.name]: undefined } as Row : previous));
                  }}
                  className="mt-1 text-[11px] text-ink-faint hover:text-accent disabled:opacity-50"
                >
                  Use database default
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={closeWithoutSaving} disabled={saving || submitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={saving || submitting}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            try {
              if (mode === "create") {
                if (!onCreate) throw new Error("Row creation is not available.");
                const values = Object.fromEntries(
                  Array.from(touched, (name) => [name, draft[name]])
                );
                await onCreate(values);
              } else {
                if (!onSave) throw new Error("Row editing is not available.");
                await onSave(draft);
              }
              onClose();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Couldn't save this row.");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {saving || submitting ? "Saving…" : mode === "create" ? "Create row" : "Save row"}
        </Button>
      </div>
    </Drawer>
  );
}
