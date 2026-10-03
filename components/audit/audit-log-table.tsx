"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";

type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  resource: string;
  result: "success" | "failed";
  ip: string | null;
  at: string;
};

type Filters = {
  actor: string;
  action: string;
  resource: string;
  result: "" | "success" | "failed";
  from: string;
  to: string;
  search: string;
};

type AuditPage = {
  events: AuditEvent[];
  page: number;
  pageSize: number;
  total: number;
};

const EMPTY_FILTERS: Filters = { actor: "", action: "", resource: "", result: "", from: "", to: "", search: "" };

function isAuditPage(value: unknown): value is AuditPage {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return body.source === "protodb_admin.audit_log" &&
    Array.isArray(body.events) &&
    body.events.every((item) => {
      if (!item || typeof item !== "object") return false;
      const event = item as Record<string, unknown>;
      return typeof event.id === "string" && typeof event.actor === "string" &&
        typeof event.action === "string" && typeof event.resource === "string" &&
        (event.result === "success" || event.result === "failed") &&
        (event.ip === null || typeof event.ip === "string") && typeof event.at === "string";
    }) &&
    Number.isSafeInteger(body.page) && Number.isSafeInteger(body.pageSize) && Number.isSafeInteger(body.total);
}

function responseError(value: unknown): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
  }
  return "Audit history could not be loaded.";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Invalid timestamp" : date.toLocaleString();
}

export function AuditLogTable() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    setLoading(true);
    setError(null);
    fetch(`/api/audit?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseError(body));
        if (!body || typeof body !== "object" || !("ok" in body) || (body as { ok?: unknown }).ok !== true ||
            !isAuditPage(body)) {
          throw new Error("The audit API returned an invalid response.");
        }
        setResult(body);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Audit history could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, page, retry]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setFilters({ ...draft });
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(0);
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <section aria-label="Live audit history">
      <div className="mb-3 rounded-lg border border-accent-line bg-accent-soft px-3 py-2">
        <p className="text-sm font-medium text-ink">Live audit log — protodb_admin.audit_log</p>
        <p className="mt-1 text-xs text-ink-muted">
          Database-backed filters and pagination. Available events only; not every system event is necessarily logged.
        </p>
      </div>

      <form onSubmit={applyFilters} className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-ink-muted">
          Search
          <Input className="mt-1" icon={<Search className="h-3.5 w-3.5" />} value={draft.search} maxLength={200} onChange={(event) => setDraft({ ...draft, search: event.target.value })} placeholder="Actor, action, resource…" />
        </label>
        <label className="text-xs text-ink-muted">
          Actor
          <Input className="mt-1" value={draft.actor} maxLength={200} onChange={(event) => setDraft({ ...draft, actor: event.target.value })} />
        </label>
        <label className="text-xs text-ink-muted">
          Action
          <Input className="mt-1" value={draft.action} maxLength={200} onChange={(event) => setDraft({ ...draft, action: event.target.value })} />
        </label>
        <label className="text-xs text-ink-muted">
          Resource
          <Input className="mt-1" value={draft.resource} maxLength={200} onChange={(event) => setDraft({ ...draft, resource: event.target.value })} />
        </label>
        <label className="text-xs text-ink-muted">
          Result
          <select aria-label="Filter by result" className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink" value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value as Filters["result"] })}>
            <option value="">All results</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label className="text-xs text-ink-muted">
          From (inclusive)
          <Input className="mt-1" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
        </label>
        <label className="text-xs text-ink-muted">
          Before (exclusive)
          <Input className="mt-1" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" loading={loading}>Apply filters</Button>
          <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>Clear</Button>
        </div>
      </form>

      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-ink-faint">
        <span>{result ? `${result.total.toLocaleString()} matching events` : "Audit records"}</span>
        <span>Newest first · 25 records per page · database timestamps</span>
      </div>

      {loading ? (
        <div role="status" aria-label="Loading live audit history" className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Audit history unavailable"
          description={error}
          action={<Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button>}
        />
      ) : result && result.events.length === 0 ? (
        <EmptyState
          icon={Search}
          title={result.total === 0 ? "No audit records match" : "No records on this page"}
          description={result.total === 0 ? "No persisted events match the selected filters." : "Try the previous page or clear filters."}
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Result</TableHeaderCell>
                <TableHeaderCell>Actor</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
                <TableHeaderCell>Resource</TableHeaderCell>
                <TableHeaderCell>IP</TableHeaderCell>
                <TableHeaderCell>When</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {result?.events.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.result === "success"
                      ? <CheckCircle2 aria-label="Success" className="h-4 w-4 text-success" />
                      : <XCircle aria-label="Failed" className="h-4 w-4 text-danger" />}
                  </TableCell>
                  <TableCell className="text-ink-muted">{entry.actor}</TableCell>
                  <TableCell mono><Badge tone="neutral">{entry.action}</Badge></TableCell>
                  <TableCell mono className="text-ink">{entry.resource}</TableCell>
                  <TableCell mono className="text-ink-faint">{entry.ip ?? "—"}</TableCell>
                  <TableCell className="text-ink-faint">{formatTimestamp(entry.at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 flex items-center justify-between">
            <Button variant="secondary" size="sm" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <span aria-live="polite" className="text-xs text-ink-muted">Page {page + 1} of {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={!result || page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
