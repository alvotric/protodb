"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  KeyRound,
  Link2,
  Columns3,
  Maximize2,
  X,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowDetailDrawer } from "@/components/database/row-detail-drawer";
import { ColumnValueEditor } from "@/components/database/column-value-editor";
import { cn } from "@/lib/utils";
import type { RealColumn } from "@/lib/database/schema-service";
import type { TableFilter, TableFilterOperator } from "@/lib/database/table-data-service";

const PAGE_SIZE = 25;
const MIN_COLUMN_WIDTH = 100;

type FilterClause = TableFilter & { id: number; value: string; hasValue: boolean };
type RowsResponse = { ok: boolean; rows?: Record<string, unknown>[]; totalCount?: number; error?: string };
type MutationResponse = { ok: boolean; row?: Record<string, unknown>; deletedCount?: number; error?: string };

function availableOperators(column: RealColumn): TableFilterOperator[] {
  const type = column.type.toLowerCase();
  const operators: TableFilterOperator[] = ["eq", "neq"];
  if (["text", "character varying", "character", "json", "jsonb"].includes(type)) {
    operators.push("contains");
  }
  if (["smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision", "date"].includes(type) ||
      type.startsWith("timestamp ") || type.startsWith("time ")) {
    operators.push("gt", "gte", "lt", "lte");
  }
  if (column.nullable) operators.push("is_null", "not_null");
  return operators;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left === "object" && typeof right === "object") return JSON.stringify(left) === JSON.stringify(right);
  return false;
}

/**
 * Live Phase 4 table view. All row reads and mutations go through the
 * authenticated PostgreSQL API; UI-only column state never changes data.
 */
export function RealTableDataGrid({ schema, table, columns }: { schema: string; table: string; columns: RealColumn[] }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<FilterClause[]>([]);
  const [debouncedFilters, setDebouncedFilters] = useState<FilterClause[]>([]);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: string; column: string } | null>(null);
  const [editValue, setEditValue] = useState<unknown>("");
  const [savingCell, setSavingCell] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [drawerRowId, setDrawerRowId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<"edit" | "create" | null>(null);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(columns.map((column) => column.name)));
  const [columnOrder, setColumnOrder] = useState<string[]>(() => columns.map((column) => column.name));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((column) => [column.name, 180]))
  );
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ column: string; startX: number; startWidth: number } | null>(null);
  const nextFilterId = useRef(1);
  const savingRef = useRef(false);
  const cancelledEditRef = useRef(false);

  const primaryKeyColumn = columns.find((column) => column.isPrimaryKey)?.name ?? "";
  const hasSinglePrimaryKey = columns.filter((column) => column.isPrimaryKey).length === 1;
  const orderedColumns = useMemo(
    () => columnOrder.map((name) => columns.find((column) => column.name === name)).filter((column): column is RealColumn => Boolean(column)),
    [columns, columnOrder]
  );
  const shownColumns = orderedColumns.filter((column) => visibleColumns.has(column.name));

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 350);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    if (!resizing) return;
    const activeResize = resizing;
    function move(event: PointerEvent) {
      const width = Math.max(MIN_COLUMN_WIDTH, activeResize.startWidth + event.clientX - activeResize.startX);
      setColumnWidths((previous) => ({ ...previous, [activeResize.column]: width }));
    }
    function stop() {
      setResizing(null);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [resizing]);

  const loadRows = useCallback(async (requestedPage = page) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(PAGE_SIZE) });
    if (sortColumn) {
      params.set("sortColumn", sortColumn);
      params.set("sortDir", sortDir);
    }
    const activeFilters: TableFilter[] = debouncedFilters
      .filter(({ operator, hasValue }) => operator === "is_null" || operator === "not_null" || hasValue)
      .map(({ column, operator, value }) =>
        operator === "is_null" || operator === "not_null" ? { column, operator } : { column, operator, value }
      );
    if (activeFilters.length) params.set("filters", JSON.stringify(activeFilters));

    try {
      const response = await fetch(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows?${params.toString()}`);
      const data = await response.json() as RowsResponse;
      if (!response.ok || !data.ok || !data.rows || typeof data.totalCount !== "number") {
        setError(data.error ?? "Failed to load rows.");
        setRows(null);
        return;
      }
      const safeTotal = Number.isSafeInteger(data.totalCount) && data.totalCount >= 0 ? data.totalCount : 0;
      const returnedPageCount = Math.max(1, Math.ceil(safeTotal / PAGE_SIZE));
      // If the requested page is now out of range (e.g. rows were deleted),
      // clamp and let the page effect refetch instead of flashing an empty
      // "No rows match" state for a page that no longer exists.
      if (requestedPage >= returnedPageCount) {
        setTotalCount(safeTotal);
        setPage(returnedPageCount - 1);
        return;
      }
      setRows(data.rows);
      setTotalCount(safeTotal);
      setPage((current) => Math.min(current, returnedPageCount - 1));
    } catch {
      setError("Couldn't reach the server.");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [schema, table, page, sortColumn, sortDir, debouncedFilters]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    setPage(0);
    setFilters([]);
    setDebouncedFilters([]);
    setSortColumn(null);
    setSelected(new Set());
    setVisibleColumns(new Set(columns.map((column) => column.name)));
    setColumnOrder(columns.map((column) => column.name));
    setColumnWidths(Object.fromEntries(columns.map((column) => [column.name, 180])));
    setDrawerRowId(null);
    // The explorer remounts this grid on table changes. Keep this reset
    // for schema/table changes if that mounting behavior is later altered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, table]);

  function toggleSort(name: string) {
    if (sortColumn !== name) {
      setSortColumn(name);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortColumn(null);
    }
    setPage(0);
  }

  function rowKey(row: Record<string, unknown>, index: number): string {
    const value = row[primaryKeyColumn];
    return value === null || value === undefined ? `row-${page}-${index}` : String(value);
  }

  function toggleSelected(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(row: Record<string, unknown>, column: RealColumn, id: string) {
    if (column.isPrimaryKey || column.isGenerated || column.isIdentity || !hasSinglePrimaryKey || savingRef.current) return;
    cancelledEditRef.current = false;
    setError(null);
    setEditingCell({ rowId: id, column: column.name });
    setEditValue(row[column.name] ?? (row[column.name] === null ? null : ""));
  }

  async function commitEdit(row: Record<string, unknown>, column: RealColumn) {
    if (!editingCell || savingRef.current) return;
    const originalValue = row[column.name];
    if (valuesEqual(editValue, originalValue)) {
      setEditingCell(null);
      return;
    }
    savingRef.current = true;
    setSavingCell(true);
    setError(null);
    let saved = false;
    try {
      const response = await fetch(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryKeyColumn,
          primaryKeyValue: row[primaryKeyColumn],
          changes: { [column.name]: editValue },
        }),
      });
      const data = await response.json() as MutationResponse;
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to update row.");
      saved = true;
      await loadRows();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't reach the server.");
    } finally {
      savingRef.current = false;
      setSavingCell(false);
      if (saved) setEditingCell(null);
    }
  }

  async function saveDetail(next: Record<string, unknown>) {
    if (!hasSinglePrimaryKey || !drawerRow) throw new Error("Row editing requires a single-column primary key.");
    const changes = Object.fromEntries(
      columns
        .filter((column) =>
          !column.isPrimaryKey &&
          !column.isGenerated &&
          !column.isIdentity &&
          !valuesEqual(next[column.name], drawerRow[column.name])
        )
        .map((column) => [column.name, next[column.name]])
    );
    if (Object.keys(changes).length === 0) return;
    const response = await fetch(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryKeyColumn, primaryKeyValue: drawerRow[primaryKeyColumn], changes }),
    });
    const data = await response.json() as MutationResponse;
    if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to update row.");
    await loadRows();
  }

  function openCreateDrawer() {
    setError(null);
    setDrawerRowId(null);
    setDrawerMode("create");
  }

  async function createRow(values: Record<string, unknown>) {
    setAdding(true);
    setError(null);
    try {
      const response = await fetch(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json() as MutationResponse;
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to add row.");
      setPage(0);
      await loadRows(0);
    } catch (cause) {
      throw new Error(cause instanceof Error ? cause.message : "Couldn't reach the server.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteSelected() {
    if (!hasSinglePrimaryKey || !primaryKeyColumn) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryKeyColumn, primaryKeyValues: Array.from(selected) }),
      });
      const data = await response.json() as MutationResponse;
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to delete rows.");
      setSelected(new Set());
      await loadRows();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't reach the server.");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  function addFilter() {
    const column = columns[0];
    if (!column || filters.length >= 20) return;
    const operator = availableOperators(column)[0];
    setFilters((previous) => [...previous, { id: nextFilterId.current++, column: column.name, operator, value: "", hasValue: false }]);
    setPage(0);
  }

  function updateFilter(id: number, update: Partial<FilterClause>) {
    setFilters((previous) =>
      previous.map((filter) => {
        if (filter.id !== id) return filter;
        const columnChanged = typeof update.column === "string" && update.column !== filter.column;
        const next = { ...filter, ...update };
        const column = columns.find((entry) => entry.name === next.column);
        if (columnChanged) {
          next.value = "";
          next.hasValue = false;
        } else if (
          Object.prototype.hasOwnProperty.call(update, "value") &&
          !Object.prototype.hasOwnProperty.call(update, "hasValue")
        ) {
          next.hasValue = true;
        }
        const operators = column ? availableOperators(column) : [];
        if (!operators.includes(next.operator)) next.operator = operators[0] ?? "eq";
        return next;
      })
    );
    setPage(0);
  }

  function reorderVisibleColumns(source: string, target: string) {
    if (source === target) return;
    const currentVisible = columnOrder.filter((name) => visibleColumns.has(name));
    const sourceIndex = currentVisible.indexOf(source);
    const targetIndex = currentVisible.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0) return;
    currentVisible.splice(sourceIndex, 1);
    currentVisible.splice(targetIndex, 0, source);
    let nextVisibleIndex = 0;
    setColumnOrder((previous) =>
      previous.map((name) => visibleColumns.has(name) ? currentVisible[nextVisibleIndex++] : name)
    );
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const drawerRow = rows?.find((row, index) => rowKey(row, index) === drawerRowId) ?? null;
  const tableWidth = 64 + shownColumns.reduce((total, column) => total + (columnWidths[column.name] ?? 180), 0) + 44;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={addFilter} disabled={filters.length >= 20}>
            <Search className="h-3.5 w-3.5" />
            Add filter
          </Button>
          <Button size="sm" onClick={openCreateDrawer} disabled={adding}>
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add row
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="danger" onClick={() => setDeleteConfirmOpen(true)} disabled={!hasSinglePrimaryKey}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size}
            </Button>
          )}
          <div className="relative ml-auto">
            <Button size="sm" variant="secondary" onClick={() => setColumnsMenuOpen((open) => !open)}>
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </Button>
            {columnsMenuOpen && (
              <>
                <button aria-label="Close columns menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setColumnsMenuOpen(false)} />
                <div className="glass absolute right-0 top-10 z-50 w-52 rounded-xl border border-border-strong bg-surface-raised p-1.5 shadow-raised">
                  {orderedColumns.map((column) => (
                    <label key={column.name} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-muted hover:bg-surface-hover">
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(column.name)}
                        onChange={() => setVisibleColumns((previous) => {
                          const next = new Set(previous);
                          if (next.has(column.name)) next.delete(column.name);
                          else next.add(column.name);
                          return next;
                        })}
                        className="h-3.5 w-3.5 rounded border-border accent-accent"
                      />
                      <span className="font-mono text-xs">{column.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          {(loading || savingCell) && (
            <span className="flex items-center gap-1.5 text-xs text-ink-faint">
              <Loader2 className="h-3 w-3 animate-spin" />
              {savingCell ? "Saving…" : "Loading…"}
            </span>
          )}
        </div>

        {filters.length > 0 && (
          <div className="space-y-2">
            {filters.map((filter) => {
              const column = columns.find((entry) => entry.name === filter.column) ?? columns[0];
              if (!column) return null;
              const operators = availableOperators(column);
              const noValue = filter.operator === "is_null" || filter.operator === "not_null";
              return (
                <div key={filter.id} className="flex flex-wrap items-center gap-2">
                  {filter.id !== filters[0].id && <span className="text-[11px] font-medium text-ink-faint">AND</span>}
                  <select
                    aria-label="Filter column"
                    value={filter.column}
                    onChange={(event) => updateFilter(filter.id, { column: event.target.value, value: "" })}
                    className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-ink focus:border-accent-line focus:outline-none"
                  >
                    {columns.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                  </select>
                  <select
                    aria-label="Filter operator"
                    value={filter.operator}
                    onChange={(event) => updateFilter(filter.id, { operator: event.target.value as TableFilterOperator })}
                    className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-ink focus:border-accent-line focus:outline-none"
                  >
                    {operators.map((operator) => <option key={operator} value={operator}>{operator.replace("_", " ")}</option>)}
                  </select>
                  {!noValue && (
                    <div className="w-48">
                      <ColumnValueEditor
                        column={{ ...column, nullable: false }}
                        value={filter.value}
                        onChange={(value) => {
                          const text = value === null || value === undefined ? "" : String(value);
                          const textType = ["text", "character varying", "character"].includes(column.type.toLowerCase());
                          updateFilter(filter.id, {
                            value: text,
                            hasValue: value !== null && value !== undefined && (text !== "" || textType),
                          });
                        }}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Remove filter"
                    onClick={() => setFilters((previous) => previous.filter((item) => item.id !== filter.id))}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-surface-hover hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {error && rows && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>

      {error && !rows ? (
        <ErrorState
          description={error}
          className="h-full"
          action={<Button size="sm" variant="secondary" onClick={() => void loadRows()}>Retry</Button>}
        />
      ) : loading && !rows ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-ink-faint" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title={filters.some((filter) => filter.hasValue || filter.operator === "is_null" || filter.operator === "not_null") ? "No rows match" : "No rows"}
          description={filters.some((filter) => filter.hasValue || filter.operator === "is_null" || filter.operator === "not_null") ? "No rows match all of these filters." : "This table is empty."}
          className="h-full"
        />
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-sm" style={{ tableLayout: "fixed", width: `max(100%, ${tableWidth}px)` }}>
            <colgroup>
              <col style={{ width: 48 }} />
              {shownColumns.map((column) => <col key={column.name} style={{ width: columnWidths[column.name] ?? 180 }} />)}
              <col style={{ width: 44 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <th className="w-12 px-3 py-2.5" />
                {shownColumns.map((column) => (
                  <th
                    key={column.name}
                    draggable
                    onDragStart={(event) => {
                      setDraggedColumn(column.name);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", column.name);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const source = event.dataTransfer.getData("text/plain") || draggedColumn;
                      if (source) reorderVisibleColumns(source, column.name);
                      setDraggedColumn(null);
                    }}
                    onDragEnd={() => setDraggedColumn(null)}
                    className={cn("relative px-3 py-2.5 text-left", draggedColumn === column.name && "opacity-50")}
                  >
                    <div className="flex items-center">
                      <GripVertical className="mr-1 h-3 w-3 shrink-0 cursor-grab text-ink-faint" />
                      <button
                        onClick={() => toggleSort(column.name)}
                        className="group flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
                      >
                        {column.isPrimaryKey && <KeyRound className="h-3 w-3 shrink-0 text-accent" />}
                        {column.isForeignKey && <Link2 className="h-3 w-3 shrink-0 text-ink-faint" />}
                        <span className="truncate font-mono">{column.name}</span>
                        {sortColumn === column.name ? (
                          sortDir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label={`Resize ${column.name} column`}
                      draggable={false}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setResizing({ column: column.name, startX: event.clientX, startWidth: columnWidths[column.name] ?? 180 });
                      }}
                      className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none"
                    />
                  </th>
                ))}
                <th className="w-11 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => {
                const id = rowKey(row, index);
                return (
                  <tr key={id} className="group transition-colors hover:bg-surface-hover/50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        disabled={!hasSinglePrimaryKey}
                        onChange={() => toggleSelected(id)}
                        aria-label="Select row"
                        className="h-3.5 w-3.5 rounded border-border accent-accent disabled:opacity-30"
                      />
                    </td>
                    {shownColumns.map((column) => {
                      const value = row[column.name];
                      const isEditing = editingCell?.rowId === id && editingCell.column === column.name;
                      return (
                        <td
                          key={column.name}
                          onClick={() => !isEditing && startEdit(row, column, id)}
                          className={cn(
                            "px-3 py-2 font-mono text-[13px]",
                            column.isPrimaryKey || column.isGenerated || column.isIdentity || !hasSinglePrimaryKey
                              ? "text-ink-faint"
                              : "cursor-text text-ink"
                          )}
                        >
                          {isEditing ? (
                            <div
                              onClick={(event) => event.stopPropagation()}
                              onBlur={(event) => {
                                if (cancelledEditRef.current) {
                                  cancelledEditRef.current = false;
                                  return;
                                }
                                if (!event.currentTarget.contains(event.relatedTarget)) void commitEdit(row, column);
                              }}
                            >
                              <ColumnValueEditor
                                column={column}
                                value={editValue}
                                onChange={setEditValue}
                                autoFocus
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && event.currentTarget.tagName !== "TEXTAREA") {
                                    event.preventDefault();
                                    void commitEdit(row, column);
                                  }
                                  if (event.key === "Escape") {
                                    cancelledEditRef.current = true;
                                    setEditingCell(null);
                                  }
                                }}
                              />
                            </div>
                          ) : value === null || value === undefined ? (
                            <Badge tone="neutral">NULL</Badge>
                          ) : (
                            <span className="block truncate" title={displayValue(value)}>{displayValue(value)}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerRowId(id);
                          setDrawerMode("edit");
                        }}
                        aria-label="Open row details"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint opacity-0 transition-opacity hover:bg-surface-hover hover:text-ink group-hover:opacity-100"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <p className="text-xs text-ink-faint">{totalCount.toLocaleString()} row{totalCount === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Page {page + 1} of {pageCount}</span>
          <button
            onClick={() => setPage((previous) => Math.max(0, previous - 1))}
            disabled={page === 0 || loading}
            aria-label="Previous page"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPage((previous) => Math.min(pageCount - 1, previous + 1))}
            disabled={page >= pageCount - 1 || loading}
            aria-label="Next page"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <RowDetailDrawer
        open={drawerMode !== null}
        onClose={() => {
          setDrawerRowId(null);
          setDrawerMode(null);
        }}
        tableName={`${schema}.${table}`}
        columns={columns}
        row={drawerRow}
        onSave={saveDetail}
        onCreate={createRow}
        mode={drawerMode ?? "edit"}
        saving={adding}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${selected.size} row${selected.size === 1 ? "" : "s"}?`}
        description="This is a real delete against your connected database. This can't be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDeleteSelected}
      />
    </div>
  );
}
