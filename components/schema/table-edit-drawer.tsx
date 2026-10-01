"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, KeyRound } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TableColumn } from "@/lib/mock-data";

const COLUMN_TYPES = ["uuid", "text", "integer", "bigint", "boolean", "timestamptz", "numeric", "jsonb"];

export function TableEditDrawer({
  open,
  onClose,
  tableName,
  columns,
  isNewTable,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  tableName: string;
  columns: TableColumn[];
  isNewTable: boolean;
  onSave: (name: string, columns: TableColumn[]) => void;
}) {
  const [name, setName] = useState(tableName);
  const [draft, setDraft] = useState<TableColumn[]>(columns);

  useEffect(() => {
    setName(tableName);
    setDraft(columns);
  }, [tableName, columns, open]);

  function updateColumn(index: number, patch: Partial<TableColumn>) {
    setDraft((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeColumn(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function addColumn() {
    setDraft((prev) => [...prev, { name: `column_${prev.length + 1}`, type: "text", nullable: true }]);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isNewTable ? "New table" : `Edit ${tableName}`}
      description={isNewTable ? "Define its name and starting columns." : "Add, edit, or drop columns."}
    >
      <div className="space-y-4">
        {isNewTable && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">Table name</label>
            <Input mono value={name} onChange={(e) => setName(e.target.value)} placeholder="table_name" />
          </div>
        )}

        <div className="space-y-2.5">
          {draft.map((col, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  mono
                  value={col.name}
                  onChange={(e) => updateColumn(i, { name: e.target.value })}
                  className="h-8 text-[13px]"
                />
                <button
                  onClick={() => removeColumn(i)}
                  aria-label={`Remove column ${col.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <select
                  value={col.type}
                  onChange={(e) => updateColumn(i, { type: e.target.value })}
                  className="h-8 rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink focus:border-accent-line focus:outline-none"
                >
                  {COLUMN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={col.nullable}
                    onChange={(e) => updateColumn(i, { nullable: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-border accent-accent"
                  />
                  Nullable
                </label>

                <button
                  onClick={() => updateColumn(i, { isPrimaryKey: !col.isPrimaryKey })}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                    col.isPrimaryKey ? "bg-accent-soft text-accent" : "text-ink-faint hover:text-ink-muted"
                  )}
                >
                  <KeyRound className="h-3 w-3" />
                  Primary key
                </button>
              </div>
            </div>
          ))}
        </div>

        <Button variant="secondary" size="sm" onClick={addColumn} className="w-full">
          <Plus className="h-3.5 w-3.5" />
          Add column
        </Button>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={!name.trim() || draft.length === 0} onClick={() => onSave(name.trim(), draft)}>
          {isNewTable ? "Create table" : "Save changes"}
        </Button>
      </div>
    </Drawer>
  );
}
