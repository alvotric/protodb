"use client";

import { useMemo, useState } from "react";
import { Search, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { auditLog, timeAgo } from "@/lib/mock-data";

type ResultFilter = "all" | "success" | "failed";

export function AuditLogTable() {
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return auditLog.filter((entry) => {
      if (resultFilter !== "all" && entry.result !== resultFilter) return false;
      if (!q) return true;
      return (
        entry.actor.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.resource.toLowerCase().includes(q)
      );
    });
  }, [query, resultFilter]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-64">
          <Input
            icon={<Search className="h-3.5 w-3.5" />}
            placeholder="Search actor, action, resource…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="glass flex items-center gap-1 rounded-lg border border-border p-1">
          {(["all", "success", "failed"] as ResultFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setResultFilter(f)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs capitalize transition-colors",
                resultFilter === f ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-ink-faint">{filtered.length.toLocaleString()} events</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching events" description="Try a different search term or filter." />
      ) : (
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
            {filtered.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  {entry.result === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-danger" />
                  )}
                </TableCell>
                <TableCell className="text-ink-muted">{entry.actor}</TableCell>
                <TableCell mono>
                  <Badge tone="neutral">{entry.action}</Badge>
                </TableCell>
                <TableCell mono className="text-ink">
                  {entry.resource}
                </TableCell>
                <TableCell mono className="text-ink-faint">
                  {entry.ip}
                </TableCell>
                <TableCell className="text-ink-faint">{timeAgo(entry.at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
