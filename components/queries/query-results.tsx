"use client";

import { AlertTriangle, Download, Loader2, TerminalSquare, Clock, Rows3, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { QueryOutcome, ScriptOutcome } from "@/lib/queries/types";
import { toCsv, toJson } from "@/lib/queries/export";
import { resolveResultsView } from "@/lib/queries/results-view";

type DisplayOutcome = (QueryOutcome | ScriptOutcome) & { source: "live" | "demo" };

function isScript(outcome: DisplayOutcome): outcome is ScriptOutcome & { source: "live" | "demo" } {
  return (outcome as { kind?: unknown }).kind === "script";
}

function formatCell(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "object") return JSON.stringify(value) ?? "";
  return String(value);
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
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function QueryResults({
  outcome,
  loading,
  onGoToError,
}: {
  outcome: DisplayOutcome | null;
  loading: boolean;
  onGoToError: () => void;
}) {
  // The panel state depends only on the execution outcome and loading
  // flag — never on history loading or other UI state — so a history
  // refresh cannot clear or replace visible results.
  const view = resolveResultsView(outcome, loading);

  if (view === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
        <p className="text-sm">Running query…</p>
      </div>
    );
  }

  if (view === "empty" || outcome === null) {
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
    const failedStatement = isScript(outcome) ? outcome.failedStatement : null;
    const failedPreview = isScript(outcome) && !outcome.ok ? outcome.failedPreview : undefined;
    return (
      <div className="h-full overflow-auto p-4">
        <div className="flex items-start gap-3 rounded-lg border border-danger/25 bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm text-danger">{outcome.message}</p>
            {isScript(outcome) && (
              <p className="mt-1 font-mono text-xs text-ink-muted">
                Script: {outcome.executedStatements}/{outcome.totalStatements} statements executed
                {failedStatement !== null && failedStatement !== undefined ? ` — failed at statement ${failedStatement}` : ""}
                {" "}({outcome.transactionMode} mode, {outcome.durationMs}ms)
              </p>
            )}
            {failedPreview && (
              <p className="mt-1 truncate font-mono text-xs text-ink-faint" title={failedPreview}>
                Failing statement preview: {failedPreview}
              </p>
            )}
            {isScript(outcome) && outcome.results.length > 0 && (
              <div className="mt-2 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>#</TableHeaderCell>
                      <TableHeaderCell>Command</TableHeaderCell>
                      <TableHeaderCell>Preview</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {outcome.results.map((result) => (
                      <TableRow key={result.index}>
                        <TableCell mono>{result.index}</TableCell>
                        <TableCell mono>{result.command}</TableCell>
                        <TableCell mono>{result.preview}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {"location" in outcome && outcome.location
              ? <p className="mt-1 font-mono text-xs text-ink-faint">Line {outcome.location.line}, column {outcome.location.column} (PostgreSQL position {outcome.position})</p>
              : "position" in outcome && outcome.position !== undefined
                ? <p className="mt-1 font-mono text-xs text-ink-faint">Reported character position {outcome.position}.</p>
                : null}
            {"location" in outcome && outcome.location && (
              <Button className="mt-3" size="sm" variant="secondary" onClick={onGoToError}>
                Go to error location
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isScript(outcome) && outcome.ok) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 border-b border-border px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <ListChecks className="h-3.5 w-3.5 text-ink-faint" />
            {outcome.executedStatements}/{outcome.totalStatements} statements executed
          </span>
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Clock className="h-3.5 w-3.5 text-ink-faint" />
            {outcome.durationMs}ms
          </span>
          <Badge tone="success" dot>
            Script success · {outcome.transactionMode}
          </Badge>
          <Badge tone="success" dot>
            {outcome.source === "live" ? "Live database" : "Demo result"}
          </Badge>
        </div>
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>#</TableHeaderCell>
                <TableHeaderCell>Command</TableHeaderCell>
                <TableHeaderCell>Rows</TableHeaderCell>
                <TableHeaderCell>Preview</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {outcome.results.map((result) => (
                <TableRow key={result.index}>
                  <TableCell mono>{result.index}</TableCell>
                  <TableCell mono>{result.command}</TableCell>
                  <TableCell mono>{result.rowCount ?? "—"}</TableCell>
                  <TableCell mono>{result.preview}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (!isScript(outcome)) {
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
          {outcome.source === "live" ? "Live database" : "Demo result"}
        </Badge>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => downloadBlob(toCsv(outcome.columns, outcome.rows), "query-results.csv", "text/csv;charset=utf-8")}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => downloadBlob(toJson(outcome.rows), "query-results.json", "application/json;charset=utf-8")}
          >
            <Download className="h-3.5 w-3.5" />
            JSON
          </Button>
        </div>
      </div>

      {outcome.truncated && (
        <p className="border-b border-warning/25 bg-warning/5 px-4 py-2 text-xs text-warning">
          Output was capped at {outcome.rowCount.toLocaleString()} returned rows or 1 MB. The query may have produced more data.
        </p>
      )}

      {outcome.columns.length === 0 ? (
        <EmptyState
          icon={Rows3}
          title="Statement completed"
          description={`${outcome.rowCount.toLocaleString()} row${outcome.rowCount === 1 ? "" : "s"} affected. This statement returned no result columns.`}
        />
      ) : outcome.rows.length === 0 && outcome.truncated ? (
        <EmptyState icon={Rows3} title="Result output limit reached" description="The first result row exceeded the 1 MB output limit." />
      ) : outcome.rows.length === 0 ? (
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

  // Unreachable: script failures return in the error branch above and script
  // successes return in the script branch. Kept for type exhaustiveness.
  return null;
}
