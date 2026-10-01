import { KeyRound, Link2, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { tableColumns } from "@/lib/mock-data";

/**
 * Phase 3 — Database Explorer. Columns-only now (the table
 * name/schema/stats header moved to `table-detail.tsx`, shared with
 * Phase 4's Data tab so it isn't duplicated per-tab).
 */
export function TableStructure({ tableName }: { tableName: string }) {
  const columns = tableColumns[tableName];

  if (!columns) {
    return (
      <EmptyState
        icon={Table2}
        title="Column details not shown here"
        description="This preview only has full column data for the core sample tables (users, orders, products, order_items)."
      />
    );
  }

  return (
    <Table>
      <TableHead>
        <tr>
          <TableHeaderCell>Column</TableHeaderCell>
          <TableHeaderCell>Type</TableHeaderCell>
          <TableHeaderCell>Nullable</TableHeaderCell>
          <TableHeaderCell>Default</TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {columns.map((col) => (
          <TableRow key={col.name}>
            <TableCell className="font-mono">
              <span className="flex items-center gap-1.5">
                {col.isPrimaryKey && <KeyRound className="h-3.5 w-3.5 text-accent" />}
                {col.isForeignKey && <Link2 className="h-3.5 w-3.5 text-ink-faint" />}
                {col.name}
              </span>
            </TableCell>
            <TableCell mono className="text-ink-muted">
              {col.type}
            </TableCell>
            <TableCell>
              <Badge tone={col.nullable ? "neutral" : "warning"}>{col.nullable ? "yes" : "not null"}</Badge>
            </TableCell>
            <TableCell mono className="text-ink-faint">
              {col.default ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
