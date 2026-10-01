"use client";

import type { MouseEvent } from "react";
import { KeyRound, Link2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableColumn } from "@/lib/mock-data";

export const NODE_WIDTH = 220;
export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 26;

export function nodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + Math.max(columnCount, 1) * ROW_HEIGHT;
}

export function SchemaNode({
  name,
  columns,
  x,
  y,
  selected,
  onMouseDownHeader,
  onEdit,
}: {
  name: string;
  columns: TableColumn[];
  x: number;
  y: number;
  selected: boolean;
  onMouseDownHeader: (e: MouseEvent) => void;
  onEdit: () => void;
}) {
  return (
    <div
      style={{ left: x, top: y, width: NODE_WIDTH }}
      className={cn(
        "glass absolute select-none rounded-lg border shadow-panel",
        selected ? "border-accent-line" : "border-border"
      )}
    >
      <div
        onMouseDown={onMouseDownHeader}
        className="flex cursor-grab items-center justify-between gap-1.5 rounded-t-lg border-b border-border bg-surface-hover/60 px-3 py-2 active:cursor-grabbing"
        style={{ height: HEADER_HEIGHT }}
      >
        <span className="truncate font-mono text-[13px] font-medium text-ink">{name}</span>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onEdit}
          aria-label={`Edit ${name}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-white/10 hover:text-ink"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>

      <div>
        {columns.map((col) => (
          <div
            key={col.name}
            style={{ height: ROW_HEIGHT }}
            className="flex items-center gap-1.5 border-b border-border/60 px-3 text-[11px] last:border-b-0"
          >
            {col.isPrimaryKey ? (
              <KeyRound className="h-3 w-3 shrink-0 text-accent" />
            ) : col.isForeignKey ? (
              <Link2 className="h-3 w-3 shrink-0 text-ink-faint" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <span className="truncate font-mono text-ink-muted">{col.name}</span>
            <span className="ml-auto shrink-0 font-mono text-ink-faint">{col.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
