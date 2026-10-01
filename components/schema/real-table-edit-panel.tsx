"use client";

import { useState } from "react";
import { Plus, Trash2, KeyRound, Loader2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { RealColumn } from "@/lib/database/schema-service";
import type { NewColumnSpec } from "@/lib/database/ddl-service";

const COLUMN_TYPES = ["uuid", "text", "integer", "bigint", "boolean", "timestamptz", "numeric", "jsonb"];

/**
 * Phase 10 — Backend API & Real Data Integration (Part 3).
 *
 * Real DDL, deliberately scoped narrower than the Phase 5 mock
 * version: new tables get a full column list up front (one atomic
 * `CREATE TABLE`, safe to build up locally before submitting), but an
 * *existing* real table only offers Add Column and Drop Column here,
 * each its own immediate, independent API call -- not batched rename/
 * retype edits. Diffing a batch of column edits and replaying them as
 * several separate ALTER TABLE statements would leave a real,
 * partially-applied schema change if any single step failed midway;
 * two small, atomic, individually-confirmed operations don't have
 * that failure mode.
 */
export function RealTableEditPanel({
  open,
  onClose,
  mode,
  schema,
  table,
  existingColumns,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  schema: string;
  table: string;
  existingColumns: RealColumn[];
  onChanged: () => void;
}) {
  const [newTableName, setNewTableName] = useState("");
  const [draftColumns, setDraftColumns] = useState<NewColumnSpec[]>([{ name: "id", type: "uuid", nullable: false, isPrimaryKey: true }]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("text");
  const [newColNullable, setNewColNullable] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);

  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  function updateDraftColumn(index: number, patch: Partial<NewColumnSpec>) {
    setDraftColumns((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/database/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema, table: newTableName.trim(), columns: draftColumns }),
      });
      const data = await res.json();
      if (!data.ok) {
        setCreateError(data.error);
        return;
      }
      setNewTableName("");
      setDraftColumns([{ name: "id", type: "uuid", nullable: false, isPrimaryKey: true }]);
      onChanged();
      onClose();
    } catch {
      setCreateError("Couldn't reach the server.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddColumn() {
    setAddingColumn(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/database/tables/${schema}/${table}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newColName.trim(), type: newColType, nullable: newColNullable }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAddError(data.error);
        return;
      }
      setNewColName("");
      onChanged();
    } catch {
      setAddError("Couldn't reach the server.");
    } finally {
      setAddingColumn(false);
    }
  }

  async function handleDropColumn() {
    if (!dropTarget) return;
    setDropping(true);
    setDropError(null);
    try {
      const res = await fetch(`/api/database/tables/${schema}/${table}/columns/${dropTarget}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        setDropError(data.error);
        return;
      }
      setDropTarget(null);
      onChanged();
    } catch {
      setDropError("Couldn't reach the server.");
    } finally {
      setDropping(false);
    }
  }

  if (mode === "create") {
    return (
      <Drawer open={open} onClose={onClose} title="New table" description="Define its name and starting columns -- this really creates it.">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">Table name</label>
            <Input mono value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="table_name" />
          </div>

          <div className="space-y-2.5">
            {draftColumns.map((col, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input mono value={col.name} onChange={(e) => updateDraftColumn(i, { name: e.target.value })} className="h-8 text-[13px]" />
                  <button
                    onClick={() => setDraftColumns((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={draftColumns.length === 1}
                    aria-label={`Remove column ${col.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <select
                    value={col.type}
                    onChange={(e) => updateDraftColumn(i, { type: e.target.value })}
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
                      onChange={(e) => updateDraftColumn(i, { nullable: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-border accent-accent"
                    />
                    Nullable
                  </label>
                  <button
                    onClick={() => updateDraftColumn(i, { isPrimaryKey: !col.isPrimaryKey })}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${col.isPrimaryKey ? "bg-accent-soft text-accent" : "text-ink-faint hover:text-ink-muted"}`}
                  >
                    <KeyRound className="h-3 w-3" />
                    Primary key
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => setDraftColumns((prev) => [...prev, { name: `column_${prev.length + 1}`, type: "text", nullable: true }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add column
          </Button>

          {createError && <p className="text-sm text-danger">{createError}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!newTableName.trim() || draftColumns.length === 0 || creating} onClick={handleCreate}>
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Create table
          </Button>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} title={`Edit ${table}`} description="Add or drop columns -- both are real, immediate changes.">
      <div className="space-y-2.5">
        {existingColumns.map((col) => (
          <div key={col.name} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5">
              {col.isPrimaryKey && <KeyRound className="h-3.5 w-3.5 text-accent" />}
              <span className="font-mono text-sm text-ink">{col.name}</span>
              <span className="font-mono text-xs text-ink-faint">{col.type}</span>
            </div>
            <button
              onClick={() => setDropTarget(col.name)}
              disabled={col.isPrimaryKey}
              title={col.isPrimaryKey ? "Can't drop the primary key column here" : undefined}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-border p-3">
        <p className="mb-2 text-xs font-medium text-ink-muted">Add a column</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input mono value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="column_name" className="h-8 flex-1 text-[13px]" />
          <select
            value={newColType}
            onChange={(e) => setNewColType(e.target.value)}
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
              checked={newColNullable}
              onChange={(e) => setNewColNullable(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent"
            />
            Nullable
          </label>
        </div>
        {addError && <p className="mt-2 text-xs text-danger">{addError}</p>}
        <Button size="sm" className="mt-3 w-full" disabled={!newColName.trim() || addingColumn} onClick={handleAddColumn}>
          {addingColumn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add column
        </Button>
      </div>

      <ConfirmDialog
        open={dropTarget !== null}
        onOpenChange={(o) => !o && setDropTarget(null)}
        title={`Drop column "${dropTarget}"?`}
        description="This permanently deletes this column and every value in it, on your real, connected database. This can't be undone."
        confirmLabel="Drop column"
        destructive
        loading={dropping}
        onConfirm={handleDropColumn}
      />
      {dropError && <p className="mt-2 text-xs text-danger">{dropError}</p>}
    </Drawer>
  );
}
