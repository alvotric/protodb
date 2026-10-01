"use client";

import { nodeHeight, NODE_WIDTH } from "@/components/schema/schema-node";
import type { ForeignKeyRef, TableColumn } from "@/lib/mock-data";

export interface EdgeGeometry {
  fk: ForeignKeyRef;
  path: string;
  labelX: number;
  labelY: number;
}

function center(pos: { x: number; y: number }, columns: TableColumn[]) {
  return { cx: pos.x + NODE_WIDTH / 2, cy: pos.y + nodeHeight(columns.length) / 2 };
}

export function computeEdges(
  foreignKeys: ForeignKeyRef[],
  positions: Record<string, { x: number; y: number }>,
  columnsByTable: Record<string, TableColumn[] | undefined>
): EdgeGeometry[] {
  return foreignKeys
    .map((fk) => {
      const sourcePos = positions[fk.table];
      const targetPos = positions[fk.refTable];
      const sourceCols = columnsByTable[fk.table];
      const targetCols = columnsByTable[fk.refTable];
      if (!sourcePos || !targetPos || !sourceCols || !targetCols) return null;

      const a = center(sourcePos, sourceCols);
      const b = center(targetPos, targetCols);
      const dx = (b.cx - a.cx) * 0.4;
      const path = `M ${a.cx} ${a.cy} C ${a.cx + dx} ${a.cy}, ${b.cx - dx} ${b.cy}, ${b.cx} ${b.cy}`;

      return {
        fk,
        path,
        labelX: (a.cx + b.cx) / 2,
        labelY: (a.cy + b.cy) / 2,
      };
    })
    .filter((e): e is EdgeGeometry => e !== null);
}

export function SchemaEdges({
  edges,
  onSelectEdge,
  selectedIndex,
}: {
  edges: EdgeGeometry[];
  onSelectEdge: (index: number) => void;
  selectedIndex: number | null;
}) {
  return (
    <svg className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible">
      <defs>
        <marker id="fk-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
        </marker>
      </defs>
      {edges.map((edge, i) => (
        <g key={`${edge.fk.table}.${edge.fk.column}`} className="text-ink-faint">
          <path
            d={edge.path}
            fill="none"
            stroke="currentColor"
            strokeWidth={selectedIndex === i ? 2 : 1.25}
            className={selectedIndex === i ? "text-accent" : undefined}
            markerEnd="url(#fk-arrow)"
            opacity={selectedIndex === i ? 1 : 0.55}
          />
          <path
            d={edge.path}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            className="pointer-events-auto cursor-pointer"
            onClick={() => onSelectEdge(i)}
          />
        </g>
      ))}
    </svg>
  );
}
