"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { RealColumn } from "@/lib/database/schema-service";

const PAGE_SIZE = 25;

/**
 * Phase 10 — Backend API & Real Data Integration (Part 2).
 *
 * The real backing for Phase 4's Table View. Every interaction is a
 * genuine round trip to /api/database/tables/[schema]/[table]/rows --
 * sort, filter, and pagination all happen in the database itself (via
 * lib/database/table-data-service.ts), not client-side over a small
 * in-memory array like the Phase 4 mock version. Edits, new rows, and
 * deletes are real writes; each gets a real row in
 * `protodb_admin.audit_log`.
 */
export function RealTableDataGrid({ schema, table, columns }: { schema: string; table: string; columns: RealColumn[] }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterColumn, setFilterColumn] = useState<string>(columns[0]?.name ?? "");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: string; column: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingCell, setSavingCell] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const primaryKeyColumn = columns.find((c) => c.isPrimaryKey)?.name ?? columns[0]?.name ?? "";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (sortColumn) {
      params.set("sortColumn", sortColumn);
      params.set("sortDir", sortDir);
    }
    if (debouncedQuery && filterColumn) {
      params.set("filterColumn", filterColumn);
      params.set("filterValue", debouncedQuery);
    }

    try {
      const res = await fetch(`/api/database/tables/${schema}/${table}/rows?${params.toString()}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error === "not_configured" ? "Database not connected." : data.error);
        setRows(null);
        return;
      }
      setRows(data.rows);
      setTotalCount(data.totalCount);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [schema, table, page, sortColumn, sortDir, debouncedQuery, filterColumn]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  // Table changed -- reset paging/sort/filter/selection rather than
  // carrying over state that no longer means anything for this table.
  useEffect(() => {
    setPage(0);
    setQuery("");
    setSortColumn(null);
    setSelected(new Set());
    setFilterColumn(columns[0]?.name ?? "");
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

  function rowKey(row: Record<string, unknown>): string {
    return String(row[primaryKeyColumn]);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(row: Record<string, unknown>, column: RealColumn) {
    if (column.isPrimaryKey) return;
    setEditingCell({ rowId: rowKey(row), column: column.name });
    const value = row[column.name];
    setEditValue(value === null || value === undefined ? "" : String(value));
  }

  async function commitEdit(row: Record<string, unknown>, column: RealColumn) {
    if (!editingCell) return;
    const originalValue = row[column.name];
    const originalStr = originalValue === null || originalValue === undefined ? "" : String(originalValue);
    if (editValue === originalStr) {
      setEditingCell(null);
      return;
    }

    setSavingCell(true);
    try {
      const res = await fetch(`/api/database/tables/${schema}/${table}/rows`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryKeyColumn,
          primaryKeyValue: row[primaryKeyColumn],
          changes: { [column.name]: editValue === "" && column.nullable ? null : editValue },
        }),
      });
      const data = await res.json();
      if (data.ok) await loadRows();
      else setError(data.error);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSavingCell(false);
      setEditingCell(null);
    }
  }

  async function handleAddRow() {
    setAdding(true);
    try {
      const res = await fetch(`/api/database/tables/${schema}/${table}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        setPage(0);
        await loadRows();
      } else {
        setError(data.error);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteSelected() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/database/tables/${schema}/${table}/rows`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryKeyColumn, primaryKeyValues: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(new Set());
        await loadRows();
      } else {
        setError(data.error);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <select
          value={filterColumn}
          onChange={(e) => setFilterColumn(e.target.value)}
          className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-ink focus:border-accent-line focus:outline-none"
        >
          {columns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="w-40">
          <Input
            icon={<Search className="h-3.5 w-3.5" />}
            placeholder="Filter value…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            className="h-8"
          />
        </div>

        <Button size="sm" onClick={handleAddRow} disabled={adding}>
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add row
        </Button>

        {selected.size > 0 && (
          <Button size="sm" variant="danger" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete {selected.size}
          </Button>
        )}

        {savingCell && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-faint">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving…
          </span>
        )}
      </div>

      {error ? (
        <ErrorState
          description={error}
          className="h-full"
          action={
            <Button size="sm" variant="secondary" onClick={() => void loadRows()}>
              Retry
            </Button>
          }
        />
      ) : loading && !rows ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-ink-faint" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={Search} title="No rows" description="This table is empty, or nothing matches your filter." className="h-full" />
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <th className="w-9 px-3 py-2.5" />
                {columns.map((col) => (
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const id = rowKey(row);
                return (
                  <tr key={id} className="group transition-colors hover:bg-surface-hover/50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleSelected(id)}
                        className="h-3.5 w-3.5 rounded border-border accent-accent"
                      />
                    </td>
                    {columns.map((col) => {
                      const value = row[col.name];
                      const isEditing = editingCell?.rowId === id && editingCell?.column === col.name;

                      if (isEditing) {
                        return (
                          <td key={col.name} className="px-2 py-1.5">
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(row, col)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(row, col);
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
                          onClick={() => startEdit(row, col)}
                          className={cn(
                            "px-3 py-2 font-mono text-[13px]",
                            col.isPrimaryKey ? "text-ink-faint" : "cursor-text text-ink"
                          )}
                        >
                          {value === null ? <Badge tone="neutral">NULL</Badge> : String(value)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <p className="text-xs text-ink-faint">
          {totalCount.toLocaleString()} row{totalCount === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">
            Page {page + 1} of {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1 || loading}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

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
