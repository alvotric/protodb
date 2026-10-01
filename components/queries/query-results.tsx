"use client";

import { AlertTriangle, Download, Loader2, TerminalSquare, Clock, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { QueryOutcome } from "@/lib/sql-mock-engine";
import type { CellValue } from "@/lib/mock-data";

function formatCell(value: CellValue): string {
  return value === null ? "NULL" : String(value);
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toCSV(columns: string[], rows: Record<string, CellValue>[]): string {
  const escape = (v: CellValue) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => escape(r[c])).join(","))];
  return lines.join("\n");
}

/**
 * Phase 6 — Advanced SQL Editor & Results.
 * Export is fully real (not mocked) -- it's pure client-side data
 * transformation of whatever `runMockQuery()` returned, the same as
 * every other export button built across this project.
 */
export function QueryResults({ outcome, loading }: { outcome: QueryOutcome | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
        <p className="text-sm">Running query…</p>
      </div>
    );
  }

  if (!outcome) {
    return (
      <EmptyState
        icon={TerminalSquare}
        title="No results yet"
        description="Write a query above and run it (⌘/Ctrl + Enter) to see results here."
        className="h-full"
      />
    );
  }

  if (!outcome.ok) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-3 rounded-lg border border-danger/25 bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm text-danger">{outcome.message}</p>
            {outcome.position !== undefined && outcome.position >= 0 && (
              <p className="mt-1 font-mono text-xs text-ink-faint">at position {outcome.position}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Rows3 className="h-3.5 w-3.5 text-ink-faint" />
          {outcome.rowCount.toLocaleString()} row{outcome.rowCount === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock className="h-3.5 w-3.5 text-ink-faint" />
          {outcome.durationMs}ms
        </span>
        <Badge tone="success" dot>
          Success
        </Badge>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => downloadBlob(toCSV(outcome.columns, outcome.rows), "query-results.csv", "text/csv")}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => downloadBlob(JSON.stringify(outcome.rows, null, 2), "query-results.json", "application/json")}
          >
            <Download className="h-3.5 w-3.5" />
            JSON
          </Button>
        </div>
      </div>

      {outcome.rows.length === 0 ? (
        <EmptyState icon={Rows3} title="Zero rows" description="The query ran successfully but matched nothing." />
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHead>
              <tr>
                {outcome.columns.map((c) => (
                  <TableHeaderCell key={c}>{c}</TableHeaderCell>
                ))}
              </tr>
            </TableHead>
            <TableBody>
              {outcome.rows.map((row, i) => (
                <TableRow key={i}>
                  {outcome.columns.map((c) => (
                    <TableCell key={c} mono>
                      {row[c] === null ? <span className="text-ink-faint">NULL</span> : formatCell(row[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
