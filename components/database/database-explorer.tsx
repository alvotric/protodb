"use client";

import { useState } from "react";
import { SchemaTree } from "@/components/database/schema-tree";
import { TableDetail } from "@/components/database/table-detail";
import { tables } from "@/lib/mock-data";

/**
 * Phase 3 — Database Explorer, extended in Phase 4.
 *
 * Left: schema/table tree. Right: the selected table's detail panel,
 * which itself now has Structure (Phase 3) and Data (Phase 4) tabs —
 * see table-detail.tsx. The visual relationship diagram is still
 * ahead (Phase 5); this doesn't reach into that.
 */
export function DatabaseExplorer() {
  const [selected, setSelected] = useState(tables[0].name);
  const selectedTable = tables.find((t) => t.name === selected) ?? tables[0];

  return (
    <div className="glass grid h-[75vh] min-h-[520px] grid-cols-[260px_1fr] overflow-hidden rounded-xl border border-border shadow-panel">
      <div className="border-r border-border">
        <SchemaTree selected={selected} onSelect={setSelected} />
      </div>
      <TableDetail table={selectedTable} />
    </div>
  );
}
