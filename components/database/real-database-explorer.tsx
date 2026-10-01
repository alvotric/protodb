"use client";

import { useEffect, useState } from "react";
import { Table2, Rows3, HardDrive, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { RealSchemaTree } from "@/components/database/real-schema-tree";
import { RealTableDataGrid } from "@/components/database/real-table-data-grid";
import type { RealColumn } from "@/lib/database/schema-service";

/**
 * Phase 10 — Backend API & Real Data Integration (Part 2).
 * The real counterpart to database-explorer.tsx (which stays mock-
 * data-driven for when no database is connected -- see
 * app/database/page.tsx for the switch between the two). Columns for
 * the selected table are always fetched and settled *before*
 * RealTableDataGrid ever mounts for it, so that component never sees
 * a `schema`/`table`/`columns` combination that doesn't actually
 * match -- avoids a whole category of stale-prop bugs a naive
 * "just pass columns down" version would risk during the moment you
 * switch tables.
 */
export function RealDatabaseExplorer() {
  const [selected, setSelected] = useState<{ schema: string; table: string } | null>(null);
  const [columns, setColumns] = useState<RealColumn[] | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    setColumns(null);

    fetch(`/api/database/tables/${selected.schema}/${selected.table}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) {
          setDetailError(data.error === "not_configured" ? "Database not connected." : data.error);
          return;
        }
        setColumns(data.columns);
        setRowCount(data.rowCount);
      })
      .catch(() => {
        if (!cancelled) setDetailError("Couldn't reach the server.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="glass grid h-[75vh] min-h-[520px] grid-cols-[260px_1fr] overflow-hidden rounded-xl border border-border shadow-panel">
      <div className="border-r border-border">
        <RealSchemaTree selected={selected} onSelect={(schema, table) => setSelected({ schema, table })} />
      </div>

      <div className="flex h-full flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-faint">Select a table to get started.</div>
        ) : detailError ? (
          <ErrorState description={detailError} className="h-full" />
        ) : loadingDetail || !columns ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-ink-faint" />
          </div>
        ) : (
          <>
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-ink-faint" />
                <h2 className="font-mono text-md text-ink">{selected.table}</h2>
                <Badge tone="neutral">{selected.schema}</Badge>
                <Badge tone="success" className="ml-auto">
                  Live
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <Rows3 className="h-3.5 w-3.5 text-ink-faint" />
                  {(rowCount ?? 0).toLocaleString()} rows
                </span>
                <span className="flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-ink-faint" />
                  {columns.length} columns
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <RealTableDataGrid key={`${selected.schema}.${selected.table}`} schema={selected.schema} table={selected.table} columns={columns} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
