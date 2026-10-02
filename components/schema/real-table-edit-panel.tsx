"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, KeyRound, Loader2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { RealColumn } from "@/lib/database/schema-service";
import type { NewColumnSpec } from "@/lib/database/ddl-service";
import { ALLOWED_SCHEMA_COLUMN_TYPES, type ColumnDefaultSpec } from "@/lib/database/schema-validation";
import type { ForeignKeyRef } from "@/lib/mock-data";

const COLUMN_TYPES: readonly string[] = ALLOWED_SCHEMA_COLUMN_TYPES;
const EXPRESSION_DEFAULTS: Partial<Record<string, string[]>> = {
  uuid: ["gen_random_uuid()"],
  timestamptz: ["CURRENT_TIMESTAMP", "now()"],
};

interface TableOption {
  schema: string;
  name: string;
}

interface ExistingColumnDraft {
  name: string;
  type: string;
  nullable: boolean;
  defaultMode: "keep" | "remove" | "literal" | "expression";
  defaultValue: string;
  error: string | null;
}

function defaultType(type: string): string {
  if (type === "timestamp with time zone") return "timestamptz";
  if (type === "character varying" || type === "character") return "text";
  if (type === "decimal") return "numeric";
  return type;
}

function DefaultSpecEditor({
  type,
  value,
  onChange,
}: {
  type: string;
  value: ColumnDefaultSpec | undefined;
  onChange: (value: ColumnDefaultSpec | undefined) => void;
}) {
  const expressions = EXPRESSION_DEFAULTS[type] ?? [];
  const mode = value?.kind ?? "none";
  return (
    <div className="mt-2 space-y-2">
      <label className="block text-[11px] text-ink-muted">Default value</label>
      <select
        value={mode}
        onChange={(event) => {
          if (event.target.value === "none") onChange(undefined);
          else if (event.target.value === "literal") onChange({ kind: "literal", value: value?.kind === "literal" ? value.value : "" });
          else if (expressions.length) onChange({ kind: "expression", value: expressions[0] as "CURRENT_TIMESTAMP" | "now()" | "gen_random_uuid()" });
        }}
        className="h-8 rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink"
      >
        <option value="none">No default</option>
        <option value="literal">Literal value</option>
        {expressions.length > 0 && <option value="expression">Safe SQL expression</option>}
      </select>
      {value?.kind === "literal" && (
        <Input
          value={value.value}
          onChange={(event) => onChange({ kind: "literal", value: event.target.value })}
          placeholder={`Literal for ${type}`}
          className="h-8 text-xs"
        />
      )}
      {value?.kind === "expression" && expressions.length > 0 && (
        <select
          value={value.value}
          onChange={(event) => onChange({ kind: "expression", value: event.target.value as "CURRENT_TIMESTAMP" | "now()" | "gen_random_uuid()" })}
          className="h-8 rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink"
        >
          {expressions.map((expression) => <option key={expression} value={expression}>{expression}</option>)}
        </select>
      )}
      {value?.kind === "expression" && expressions.length === 0 && (
        <p className="text-xs text-danger">No safe expressions are available for this type.</p>
      )}
      <p className="text-[11px] text-ink-faint">Expressions are restricted to approved values; arbitrary SQL is not accepted.</p>
    </div>
  );
}

/**
 * Live Phase 5 DDL editor. Each individual column operation is sent
 * separately so a failed PostgreSQL operation cannot leave a batch
 * of schema edits partially applied.
 */
export function RealTableEditPanel({
  open,
  onClose,
  mode,
  schema,
  table,
  existingColumns,
  schemas,
  tables,
  initialForeignKey = null,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  schema: string;
  table: string;
  existingColumns: RealColumn[];
  schemas: string[];
  tables: TableOption[];
  initialForeignKey?: ForeignKeyRef | null;
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
  const [newColDefault, setNewColDefault] = useState<ColumnDefaultSpec | undefined>();
  const [addError, setAddError] = useState<string | null>(null);

  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [columnDrafts, setColumnDrafts] = useState<Record<string, ExistingColumnDraft>>({});
  const [busyColumn, setBusyColumn] = useState<string | null>(null);
  const [primaryKeyError, setPrimaryKeyError] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<
    | { kind: "type"; column: string; value: string }
    | { kind: "nullable"; column: string; value: boolean }
    | { kind: "primary-key"; column: string; value: boolean }
    | null
  >(null);

  const [sourceFkColumn, setSourceFkColumn] = useState("");
  const [refSchema, setRefSchema] = useState("");
  const [refTable, setRefTable] = useState("");
  const [refColumn, setRefColumn] = useState("");
  const [refColumns, setRefColumns] = useState<RealColumn[]>([]);
  const [constraintName, setConstraintName] = useState("");
  const [fkBusy, setFkBusy] = useState(false);
  const [fkError, setFkError] = useState<string | null>(null);

  useEffect(() => {
    setColumnDrafts(Object.fromEntries(existingColumns.map((column) => [column.name, {
      name: column.name,
      type: defaultType(column.type),
      nullable: column.nullable,
      defaultMode: "keep" as const,
      defaultValue: "",
      error: null,
    }])));
    setSourceFkColumn(initialForeignKey?.column ?? existingColumns[0]?.name ?? "");
  }, [existingColumns, initialForeignKey, open]);

  useEffect(() => {
    if (!initialForeignKey) return;
    setRefSchema(initialForeignKey.refSchema ?? "");
    setRefTable(initialForeignKey.refTable);
    setConstraintName(initialForeignKey.constraintName ?? "");
  }, [initialForeignKey]);

  useEffect(() => {
    if (!open || mode !== "edit" || !refSchema || !refTable) {
      setRefColumns([]);
      setRefColumn("");
      return;
    }
    let active = true;
    void fetch(`/api/database/tables/${encodeURIComponent(refSchema)}/${encodeURIComponent(refTable)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't load referenced table columns.");
        if (active) {
          const columns = data.columns as RealColumn[];
          setRefColumns(columns);
          const preferredColumn =
            initialForeignKey?.refSchema === refSchema && initialForeignKey.refTable === refTable
              ? initialForeignKey.refColumn
              : undefined;
          setRefColumn(preferredColumn ?? columns.find((column) => column.isPrimaryKey)?.name ?? "");
        }
      })
      .catch((err: unknown) => {
        if (active) setFkError(err instanceof Error ? err.message : "Couldn't load referenced table columns.");
      });
    return () => { active = false; };
  }, [open, mode, refSchema, refTable, initialForeignKey]);

  useEffect(() => {
    if (open && mode === "edit" && table && !initialForeignKey) {
      setConstraintName(`fk_${table}_${existingColumns[0]?.name ?? "column"}`.slice(0, 63));
    }
  }, [open, mode, table, existingColumns, initialForeignKey]);

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
      const res = await fetch(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newColName.trim(),
          type: newColType,
          nullable: newColNullable,
          ...(newColDefault ? { defaultValue: newColDefault } : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAddError(data.error);
        return;
      }
      setNewColName("");
      setNewColDefault(undefined);
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
      const res = await fetch(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/columns/${encodeURIComponent(dropTarget)}`, { method: "DELETE" });
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

  async function saveColumnChange(name: string, change: Record<string, unknown>) {
    const draft = columnDrafts[name];
    if (!draft) return;
    setBusyColumn(name);
    setColumnDrafts((prev) => ({ ...prev, [name]: { ...draft, error: null } }));
    try {
      const res = await fetch(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/columns/${encodeURIComponent(name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Column update failed.");
      onChanged();
    } catch (err) {
      setColumnDrafts((prev) => ({
        ...prev,
        [name]: { ...prev[name], error: err instanceof Error ? err.message : "Couldn't reach the server." },
      }));
    } finally {
      setBusyColumn(null);
    }
  }

  async function togglePrimaryKey(column: string, enabled: boolean) {
    setPrimaryKeyError(null);
    setBusyColumn(column);
    try {
      const res = await fetch(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/primary-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column, enabled }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Primary key update failed.");
      onChanged();
    } catch (err) {
      setPrimaryKeyError(err instanceof Error ? err.message : "Couldn't reach the server.");
    } finally {
      setBusyColumn(null);
    }
  }

  function confirmColumnChange() {
    if (!pendingChange) return;
    const change = pendingChange;
    setPendingChange(null);
    if (change.kind === "type") void saveColumnChange(change.column, { newType: change.value });
    else if (change.kind === "nullable") void saveColumnChange(change.column, { nullable: change.value });
    else void togglePrimaryKey(change.column, change.value);
  }

  async function createRelationship() {
    setFkBusy(true);
    setFkError(null);
    try {
      const res = await fetch("/api/database/foreign-keys", {
        method: initialForeignKey ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema,
          table,
          column: sourceFkColumn,
          refSchema,
          refTable,
          refColumn,
          constraintName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Foreign key creation failed.");
      onChanged();
      setRefSchema("");
      setRefTable("");
      setRefColumn("");
    } catch (err) {
      setFkError(err instanceof Error ? err.message : "Couldn't reach the server.");
    } finally {
      setFkBusy(false);
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
                    onChange={(e) => updateDraftColumn(i, { type: e.target.value as NewColumnSpec["type"] })}
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
                      disabled={col.isPrimaryKey}
                      onChange={(e) => updateDraftColumn(i, { nullable: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-border accent-accent"
                    />
                    Nullable
                  </label>
                  <button
                    onClick={() => {
                      if (col.isPrimaryKey) {
                        updateDraftColumn(i, { isPrimaryKey: false });
                      } else {
                        setDraftColumns((prev) => prev.map((current, index) => ({
                          ...current,
                          isPrimaryKey: index === i,
                          nullable: index === i ? false : current.nullable,
                        })));
                      }
                    }}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${col.isPrimaryKey ? "bg-accent-soft text-accent" : "text-ink-faint hover:text-ink-muted"}`}
                  >
                    <KeyRound className="h-3 w-3" />
                    Primary key
                  </button>
                </div>
                <DefaultSpecEditor
                  type={col.type}
                  value={col.defaultValue}
                  onChange={(defaultValue) => updateDraftColumn(i, { defaultValue })}
                />
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
      {existingColumns.filter((column) => column.isPrimaryKey).length > 1 && (
        <p className="mb-3 text-xs text-amber-300">This table has a composite primary key. Composite primary-key editing is not supported in this designer.</p>
      )}
      <div className="space-y-3">
        {existingColumns.map((col) => {
          const draft = columnDrafts[col.name];
          if (!draft) return null;
          const anotherPrimaryKey = existingColumns.some((candidate) => candidate.isPrimaryKey && candidate.name !== col.name);
          return (
            <div key={col.name} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  {col.isPrimaryKey && <KeyRound className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  <span className="truncate font-mono text-sm text-ink">{col.name}</span>
                  <span className="shrink-0 font-mono text-xs text-ink-faint">{col.type}</span>
                </div>
                <button
                  onClick={() => setDropTarget(col.name)}
                  disabled={col.isPrimaryKey || busyColumn === col.name}
                  title={col.isPrimaryKey ? "Remove the primary-key constraint before dropping this column" : undefined}
                  aria-label={`Drop column ${col.name}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    mono
                    aria-label={`Rename ${col.name}`}
                    value={draft.name}
                    onChange={(event) => setColumnDrafts((prev) => ({ ...prev, [col.name]: { ...draft, name: event.target.value } }))}
                    className="h-8 flex-1 text-xs"
                  />
                  <Button size="sm" variant="secondary" disabled={!draft.name.trim() || draft.name === col.name || busyColumn !== null} onClick={() => void saveColumnChange(col.name, { newName: draft.name.trim() })}>
                    Save name
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Change type for ${col.name}`}
                    value={draft.type}
                    onChange={(event) => setColumnDrafts((prev) => ({ ...prev, [col.name]: { ...draft, type: event.target.value } }))}
                    className="h-8 min-w-32 rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink"
                  >
                    {!COLUMN_TYPES.includes(draft.type) && <option value={draft.type}>{col.type} (unsupported for editing)</option>}
                    {COLUMN_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" disabled={!COLUMN_TYPES.includes(draft.type) || draft.type === defaultType(col.type) || busyColumn !== null} onClick={() => setPendingChange({ kind: "type", column: col.name, value: draft.type })}>
                    Change type
                  </Button>
                </div>
                {draft.type !== defaultType(col.type) && (
                  <p className="text-[11px] text-amber-400">PostgreSQL will reject incompatible casts; existing values will not be rewritten automatically.</p>
                )}
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={draft.nullable}
                    disabled={col.isPrimaryKey}
                    title={col.isPrimaryKey ? "Remove the primary-key constraint before changing nullability" : undefined}
                    onChange={(event) => setColumnDrafts((prev) => ({ ...prev, [col.name]: { ...draft, nullable: event.target.checked } }))}
                    className="h-3.5 w-3.5 rounded border-border accent-accent"
                  />
                  Nullable
                  <Button size="sm" variant="secondary" disabled={draft.nullable === col.nullable || busyColumn !== null} onClick={() => {
                    if (!draft.nullable) setPendingChange({ kind: "nullable", column: col.name, value: false });
                    else void saveColumnChange(col.name, { nullable: true });
                  }}>
                    Save nullability
                  </Button>
                </label>
                <div className="text-[11px] text-ink-muted">
                  Current default: <span className="font-mono text-ink">{col.default ?? "none"}</span>
                </div>
                <select
                  aria-label={`Default action for ${col.name}`}
                  value={draft.defaultMode}
                  onChange={(event) => setColumnDrafts((prev) => ({
                    ...prev,
                  [col.name]: {
                    ...draft,
                    defaultMode: event.target.value as ExistingColumnDraft["defaultMode"],
                    defaultValue: event.target.value === "expression"
                      ? (EXPRESSION_DEFAULTS[draft.type] ?? [])[0] ?? ""
                      : event.target.value === "literal" && draft.defaultMode !== "literal"
                        ? ""
                        : draft.defaultValue,
                  },
                  }))}
                  className="h-8 w-fit rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink"
                >
                  <option value="keep">Keep current default</option>
                  <option value="remove">Remove default</option>
                  <option value="literal">Set literal default</option>
                  {(EXPRESSION_DEFAULTS[draft.type] ?? []).length > 0 && <option value="expression">Set safe expression default</option>}
                </select>
                {draft.defaultMode === "literal" && (
                  <Input
                    aria-label={`Literal default for ${col.name}`}
                    value={draft.defaultValue}
                    onChange={(event) => setColumnDrafts((prev) => ({ ...prev, [col.name]: { ...draft, defaultValue: event.target.value } }))}
                    placeholder={`Literal for ${draft.type}`}
                    className="h-8 text-xs"
                  />
                )}
                {draft.defaultMode === "expression" && (
                  <select
                    aria-label={`Expression default for ${col.name}`}
                    value={draft.defaultValue || ((EXPRESSION_DEFAULTS[draft.type] ?? [])[0] ?? "")}
                    onChange={(event) => setColumnDrafts((prev) => ({ ...prev, [col.name]: { ...draft, defaultValue: event.target.value } }))}
                    className="h-8 w-fit rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink"
                  >
                    {(EXPRESSION_DEFAULTS[draft.type] ?? []).map((expression) => <option key={expression} value={expression}>{expression}</option>)}
                  </select>
                )}
                {draft.defaultMode !== "keep" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyColumn !== null || (draft.defaultMode !== "remove" && !draft.defaultValue.trim())}
                    onClick={() => void saveColumnChange(col.name, {
                      defaultValue: draft.defaultMode === "remove"
                        ? null
                        : { kind: draft.defaultMode, value: draft.defaultValue },
                    })}
                  >
                    Save default
                  </Button>
                )}
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <KeyRound className="h-3.5 w-3.5 text-accent" />
                  Primary key
                  <input
                    type="checkbox"
                    checked={col.isPrimaryKey}
                    disabled={anotherPrimaryKey || busyColumn !== null}
                    title={anotherPrimaryKey ? "Only single-column primary keys can be changed here" : undefined}
                    onChange={(event) => setPendingChange({ kind: "primary-key", column: col.name, value: event.target.checked })}
                    className="h-3.5 w-3.5 rounded border-border accent-accent"
                  />
                </label>
                {draft.error && <p className="text-xs text-danger">{draft.error}</p>}
              </div>
            </div>
          );
        })}
        {primaryKeyError && <p className="text-sm text-danger">{primaryKeyError}</p>}
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
        <DefaultSpecEditor type={newColType} value={newColDefault} onChange={setNewColDefault} />
        {addError && <p className="mt-2 text-xs text-danger">{addError}</p>}
        <Button size="sm" className="mt-3 w-full" disabled={!newColName.trim() || addingColumn} onClick={handleAddColumn}>
          {addingColumn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add column
        </Button>
      </div>

      <div className="mt-5 rounded-lg border border-border p-3">
        <p className="mb-2 text-xs font-medium text-ink-muted">{initialForeignKey ? "Edit foreign-key relationship" : "Add a foreign-key relationship"}</p>
        <div className="space-y-2">
          <select value={sourceFkColumn} onChange={(event) => setSourceFkColumn(event.target.value)} aria-label="Source column" className="h-8 w-full rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink">
            <option value="">Source column</option>
            {existingColumns.map((column) => <option key={column.name} value={column.name}>{column.name} ({column.type})</option>)}
          </select>
          <select value={refSchema} onChange={(event) => { setRefSchema(event.target.value); setRefTable(""); setRefColumns([]); }} aria-label="Referenced schema" className="h-8 w-full rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink">
            <option value="">Referenced schema</option>
            {schemas.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={refTable} onChange={(event) => setRefTable(event.target.value)} disabled={!refSchema} aria-label="Referenced table" className="h-8 w-full rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink disabled:opacity-50">
            <option value="">Referenced table</option>
            {tables.filter((item) => item.schema === refSchema).map((item) => <option key={`${item.schema}.${item.name}`} value={item.name}>{item.name}</option>)}
          </select>
          <select value={refColumn} onChange={(event) => setRefColumn(event.target.value)} disabled={!refTable} aria-label="Referenced key column" className="h-8 w-full rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink disabled:opacity-50">
            <option value="">Referenced primary-key column</option>
            {refColumns.filter((column) => column.isPrimaryKey).map((column) => <option key={column.name} value={column.name}>{column.name} ({column.type})</option>)}
          </select>
          <Input mono aria-label="Foreign key constraint name" value={constraintName} onChange={(event) => setConstraintName(event.target.value)} placeholder="constraint_name" className="h-8 text-xs" />
          {fkError && <p className="text-xs text-danger">{fkError}</p>}
          <Button size="sm" className="w-full" disabled={!sourceFkColumn || !refSchema || !refTable || !refColumn || !constraintName.trim() || fkBusy} onClick={() => void createRelationship()}>
            {fkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {initialForeignKey ? "Save relationship" : "Create foreign key"}
          </Button>
          <p className="text-[11px] text-ink-faint">Single-column relationships can be created here; existing composite keys are displayed as ordered pairs.</p>
        </div>
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
      <ConfirmDialog
        open={pendingChange !== null}
        onOpenChange={(open) => !open && setPendingChange(null)}
        title={
          pendingChange?.kind === "type"
            ? `Change "${pendingChange.column}" type?`
            : pendingChange?.kind === "nullable" && !pendingChange.value
              ? `Set "${pendingChange.column}" to NOT NULL?`
              : `${pendingChange?.value ? "Add" : "Remove"} primary-key constraint?`
        }
        description={
          pendingChange?.kind === "type"
            ? "PostgreSQL will validate the cast. Incompatible existing values cause the operation to fail; ProtoDB will not rewrite values."
            : pendingChange?.kind === "nullable"
              ? "PostgreSQL will reject this if any existing row contains NULL. No rows will be changed."
              : "This changes the table's key constraint. PostgreSQL validates existing values; duplicate or NULL values prevent adding a primary key."
        }
        confirmLabel="Apply schema change"
        loading={busyColumn !== null}
        onConfirm={confirmColumnChange}
      />
      {dropError && <p className="mt-2 text-xs text-danger">{dropError}</p>}
    </Drawer>
  );
}
