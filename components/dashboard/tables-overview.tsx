import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Table2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import type { RealTableSummary } from "@/lib/database/schema-service";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function TablesOverview({
  tables,
  error,
}: {
  tables: RealTableSummary[];
  error?: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Tables</CardTitle>
          <CardDescription>{error ? "Live table overview unavailable." : `${tables.length} visible tables across user schemas.`}</CardDescription>
        </div>
        <Link href="/database" className="flex shrink-0 items-center gap-1 text-xs text-ink-muted transition-colors hover:text-accent">
          View all<ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      {error ? (
        <div role="alert" className="flex items-start gap-2 px-4 pb-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      ) : tables.length === 0 ? (
        <EmptyState icon={Table2} title="No user tables found" description="No visible base tables were returned from PostgreSQL." className="py-8" />
      ) : (
        <>
          <div className="px-4 pb-2">
            <Table>
              <TableHead><tr><TableHeaderCell>Name</TableHeaderCell><TableHeaderCell>Schema</TableHeaderCell><TableHeaderCell>Rows (est.)</TableHeaderCell><TableHeaderCell>Size</TableHeaderCell></tr></TableHead>
              <TableBody>
                {tables.slice(0, 5).map((table) => (
                  <TableRow key={`${table.schema}.${table.name}`}>
                    <TableCell className="flex items-center gap-2 font-mono"><Table2 className="h-3.5 w-3.5 text-ink-faint" />{table.name}</TableCell>
                    <TableCell mono className="text-ink-muted">{table.schema}</TableCell>
                    <TableCell mono>{table.approxRowCount.toLocaleString()}</TableCell>
                    <TableCell mono>{formatBytes(table.sizeBytes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="px-4 pb-3 text-xs text-ink-faint">Row counts are PostgreSQL estimates; sizes are table/index bytes, not S3 object Storage usage.</p>
        </>
      )}
    </Card>
  );
}
