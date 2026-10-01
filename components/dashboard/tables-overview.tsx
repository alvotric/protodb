import Link from "next/link";
import { ArrowUpRight, Table2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";
import { tables } from "@/lib/mock-data";

export function TablesOverview() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Tables</CardTitle>
          <CardDescription>{tables.length} tables across 3 schemas.</CardDescription>
        </div>
        <Link
          href="/database"
          className="flex shrink-0 items-center gap-1 text-xs text-ink-muted transition-colors hover:text-accent"
        >
          View all
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <div className="px-4 pb-4">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Schema</TableHeaderCell>
              <TableHeaderCell>Rows</TableHeaderCell>
              <TableHeaderCell>Size</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {tables.slice(0, 5).map((t) => (
              <TableRow key={t.name}>
                <TableCell className="flex items-center gap-2 font-mono">
                  <Table2 className="h-3.5 w-3.5 text-ink-faint" />
                  {t.name}
                </TableCell>
                <TableCell mono className="text-ink-muted">
                  {t.schema}
                </TableCell>
                <TableCell mono>{t.rows.toLocaleString()}</TableCell>
                <TableCell mono>{t.sizeMb.toLocaleString()} MB</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
