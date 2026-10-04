"use client";

import { useState } from "react";
import { Table2, Rows3, HardDrive, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { TableStructure } from "@/components/database/table-structure";
import { TableDataGrid } from "@/components/database/table-data-grid";
import { tableColumns, tableRows, type TableInfo } from "@/lib/mock-data";
import { timeAgo } from "@/lib/time";

/**
 * Phase 4 — Table View & Data Management.
 * The table detail panel now has two tabs: Structure (Phase 3, browse
 * columns/types/keys) and Data (Phase 4, the actual row grid). One
 * shared header (name, schema, row/size/modified stats) above both
 * instead of each tab repeating it.
 */
export function TableDetail({ table }: { table: TableInfo }) {
  const [tab, setTab] = useState<"structure" | "data">("data");
  const columns = tableColumns[table.name];
  const rows = tableRows[table.name];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-ink-faint" />
          <h2 className="font-mono text-md text-ink">{table.name}</h2>
          <Badge tone="neutral">{table.schema}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Rows3 className="h-3.5 w-3.5 text-ink-faint" />
            {table.rows.toLocaleString()} rows
          </span>
          <span className="flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-ink-faint" />
            {table.sizeMb.toLocaleString()} MB
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-ink-faint" />
            Modified {timeAgo(table.lastModified)}
          </span>
        </div>

        <div className="mt-3">
          <Tabs
            items={[
              { value: "data", label: "Data" },
              { value: "structure", label: "Structure" },
            ]}
            value={tab}
            onChange={(v) => setTab(v as "structure" | "data")}
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "structure" ? (
          <div className="h-full overflow-y-auto p-4">
            <TableStructure tableName={table.name} />
          </div>
        ) : !columns || !rows ? (
          <div className="p-4">
            <EmptyState
              icon={Table2}
              title="Row data not shown here"
              description="This preview only has full row data for the core sample tables (users, products). Try one of those, or check the Structure tab."
            />
          </div>
        ) : (
          <TableDataGrid tableName={table.name} columns={columns} initialRows={rows} />
        )}
      </div>
    </div>
  );
}
