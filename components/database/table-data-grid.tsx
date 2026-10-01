"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Columns3,
  Maximize2,
  KeyRound,
  Link2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowDetailDrawer } from "@/components/database/row-detail-drawer";
import { cn } from "@/lib/utils";
import type { TableColumn, TableRowData, CellValue } from "@/lib/mock-data";

const PAGE_SIZE = 8;

/**
 * Phase 4 — Table View & Data Management.
 *
 * The real, working piece this phase exists for: sort, filter,
 * inline-edit, add, and bulk-delete row data, all client-side against
 * `lib/mock-data.ts`'s row sets (no backend until Phase 10, per the
 * roadmap -- edits here don't persist across a refresh, same as every
 * other phase's mock-data honesty). Schema changes (adding/renaming a
 * *column*) are explicitly out of scope -- that's Phase 5's Schema
 * Designer; this only ever touches row values.
 */
export function TableDataGrid({
  tableName,
  columns,
  initialRows,
}: {
  tableName: string;
  columns: TableColumn[];
  initialRows: TableRowData[];
}) {
  const primaryKey = columns.find((c) => c.isPrimaryKey)?.name ?? columns[0]?.name;

  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(columns.map((c) => c.name)));
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<CellValue>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: CellValue; column: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [drawerRowId, setDrawerRowId] = useState<CellValue | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).some((v) => v !== null && String(v).toLowerCase().includes(q)));
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (!sortColumn) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortColumn];
      const bv = b[sortColumn];
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const result = av < bv ? -1 : 1;
      return sortDir === "asc" ? result : -result;
    });
    return copy;
  }, [filtered, sortColumn, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const visibleColumns = columns.filter((c) => visibleCols.has(c.name));

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

  function toggleSelected(id: CellValue) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    const pageIds = pageRows.map((r) => r[primaryKey]);
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  function startEdit(rowId: CellValue, column: TableColumn, currentValue: CellValue) {
    if (column.isPrimaryKey || column.type === "boolean") return;
    setEditingCell({ rowId, column: column.name });
    setEditValue(currentValue === null ? "" : String(currentValue));
  }

  function commitEdit(column: TableColumn) {
    if (!editingCell) return;
    setRows((prev) =>
      prev.map((row) => {
        if (row[primaryKey] !== editingCell.rowId) return row;
        let value: CellValue = editValue;
        if (editValue === "" && column.nullable) value = null;
        else if (column.type === "integer" || column.type === "bigint") value = Number(editValue) || 0;
        return { ...row, [column.name]: value };
      })
    );
    setEditingCell(null);
  }

  function toggleBoolean(rowId: CellValue, column: string) {
    setRows((prev) => prev.map((row) => (row[primaryKey] === rowId ? { ...row, [column]: !row[column] } : row)));
  }

  function handleAddRow() {
    const blank: TableRowData = {};
    for (const col of columns) {
      if (col.isPrimaryKey) blank[col.name] = typeof rows[0]?.[col.name] === "number" ? Math.max(0, ...rows.map((r) => Number(r[primaryKey]) || 0)) + 1 : `new-${Date.now()}`;
      else if (col.type === "boolean") blank[col.name] = false;
      else if (col.type === "integer" || col.type === "bigint") blank[col.name] = 0;
      else blank[col.name] = col.nullable ? null : "";
    }
    setRows((prev) => [blank, ...prev]);
    setPage(0);
  }

  function handleDeleteSelected() {
    setRows((prev) => prev.filter((row) => !selected.has(row[primaryKey])));
    setSelected(new Set());
    setDeleteConfirmOpen(false);
  }

  const drawerRow = rows.find((r) => r[primaryKey] === drawerRowId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="max-w-xs flex-1">
          <Input
            icon={<Search className="h-3.5 w-3.5" />}
            placeholder="Filter rows…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <Button size="sm" onClick={handleAddRow}>
          <Plus className="h-3.5 w-3.5" />
          Add row
        </Button>

        {selected.size > 0 && (
          <Button size="sm" variant="danger" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete {selected.size}
          </Button>
        )}

        <div className="relative ml-auto">
          <Button size="sm" variant="secondary" onClick={() => setColumnsMenuOpen((v) => !v)}>
            <Columns3 className="h-3.5 w-3.5" />
            Columns
          </Button>
          {columnsMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setColumnsMenuOpen(false)} />
              <div className="glass absolute right-0 top-10 z-50 w-48 rounded-xl border border-border-strong bg-surface-raised p-1.5 shadow-raised">
                {columns.map((col) => (
                  <label
                    key={col.name}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-muted hover:bg-surface-hover"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.name)}
                      onChange={() =>
                        setVisibleCols((prev) => {
                          const next = new Set(prev);
                          if (next.has(col.name) && next.size > 1) next.delete(col.name);
                          else next.add(col.name);
                          return next;
                        })
                      }
                      className="h-3.5 w-3.5 rounded border-border accent-accent"
                    />
                    <span className="font-mono text-xs">{col.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No rows match"
          description={`Nothing in ${tableName} matches "${query}".`}
        />
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <th className="w-9 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r[primaryKey]))}
                    onChange={toggleSelectPage}
                    className="h-3.5 w-3.5 rounded border-border accent-accent"
                  />
                </th>
                {visibleColumns.map((col) => (
                  <th key={col.name} className="px-3 py-2.5 text-left">
                    <button
                      onClick={() => toggleSort(col.name)}
                      className="group flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      {col.isPrimaryKey && <KeyRound className="h-3 w-3 text-accent" />}
                      {col.isForeignKey && <Link2 className="h-3 w-3 text-ink-faint" />}
                      <span className="font-mono">{col.name}</span>
                      {sortColumn === col.name ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                      )}
                    </button>
                  </th>
                ))}
                <th className="w-9 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((row) => {
                const rowId = row[primaryKey];
                return (
                  <tr key={String(rowId)} className="group transition-colors hover:bg-surface-hover/50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(rowId)}
                        onChange={() => toggleSelected(rowId)}
                        className="h-3.5 w-3.5 rounded border-border accent-accent"
                      />
                    </td>
                    {visibleColumns.map((col) => {
                      const value = row[col.name];
                      const isEditing = editingCell?.rowId === rowId && editingCell?.column === col.name;

                      if (col.type === "boolean") {
                        return (
                          <td key={col.name} className="px-3 py-2">
                            <Switch checked={Boolean(value)} onChange={() => toggleBoolean(rowId, col.name)} aria-label={col.name} />
                          </td>
                        );
                      }

                      if (isEditing) {
                        return (
                          <td key={col.name} className="px-2 py-1.5">
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(col)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(col);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              className="h-7 w-full rounded-md border border-accent-line bg-canvas px-2 font-mono text-[13px] text-ink focus:outline-none"
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.name}
                          onClick={() => startEdit(rowId, col, value)}
                          className={cn(
                            "px-3 py-2 font-mono text-[13px]",
                            col.isPrimaryKey ? "text-ink-faint" : "cursor-text text-ink"
                          )}
                        >
                          {value === null ? (
                            <Badge tone="neutral">NULL</Badge>
                          ) : (
                            String(value)
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setDrawerRowId(rowId)}
                        aria-label="Expand row"
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
        <p className="text-xs text-ink-faint">
          {sorted.length.toLocaleString()} row{sorted.length === 1 ? "" : "s"}
          {query && ` (filtered from ${rows.length.toLocaleString()})`}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">
            Page {clampedPage + 1} of {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={clampedPage === 0}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={clampedPage >= pageCount - 1}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <RowDetailDrawer
        open={drawerRowId !== null}
        onClose={() => setDrawerRowId(null)}
        tableName={tableName}
        columns={columns}
        row={drawerRow}
        onSave={(next) => setRows((prev) => prev.map((r) => (r[primaryKey] === drawerRowId ? next : r)))}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${selected.size} row${selected.size === 1 ? "" : "s"}?`}
        description="This removes them from the grid for this session. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteSelected}
      />
    </div>
  );
}
