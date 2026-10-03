"use client";

import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Plus, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchemaNode } from "@/components/schema/schema-node";
import { computeEdges, SchemaEdges } from "@/components/schema/schema-edges";
import { TableEditDrawer } from "@/components/schema/table-edit-drawer";
import { RelationshipInspector } from "@/components/schema/relationship-inspector";
import { tables, tableColumns, foreignKeys, schemaNodePositions, type TableColumn } from "@/lib/mock-data";

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 760;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;

/**
 * Phase 5 — Schema Designer & Visualizer.
 *
 * Every table as a draggable node, foreign keys as clickable edges,
 * zoom controls, and add/edit/drop-column + create-table drawers —
 * everything the roadmap calls for except migration history (Phase
 * 10+ backend territory, not a Phase 5 concern). Positions and column
 * edits live in component state only, same honesty as every other
 * phase's mock data: real until you refresh, not persisted to a
 * database that doesn't exist yet.
 */
export function SchemaCanvas() {
  const [positions, setPositions] = useState(schemaNodePositions);
  const [columnsByTable, setColumnsByTable] = useState<Record<string, TableColumn[]>>(() => {
    const initial: Record<string, TableColumn[]> = {};
    for (const t of tables) initial[t.name] = tableColumns[t.name] ?? [];
    return initial;
  });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<{ name: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tableNames = Object.keys(columnsByTable);

  const edges = useMemo(
    () => computeEdges(foreignKeys, positions, columnsByTable),
    [positions, columnsByTable]
  );

  function handleHeaderMouseDown(name: string, e: MouseEvent) {
    e.preventDefault();
    const pos = positions[name] ?? { x: 40, y: 40 };
    setDragging({ name, startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y });
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragging) return;
    const dx = (e.clientX - dragging.startX) / zoom;
    const dy = (e.clientY - dragging.startY) / zoom;
    setPositions((prev) => ({
      ...prev,
      [dragging.name]: { x: Math.max(0, dragging.originX + dx), y: Math.max(0, dragging.originY + dy) },
    }));
  }

  function handleMouseUp() {
    setDragging(null);
  }

  function handleSaveColumns(name: string, columns: TableColumn[]) {
    if (creatingTable) {
      setColumnsByTable((prev) => ({ ...prev, [name]: columns }));
      setPositions((prev) => ({ ...prev, [name]: { x: 40, y: 40 } }));
      setCreatingTable(false);
    } else if (editingTable) {
      setColumnsByTable((prev) => ({ ...prev, [editingTable]: columns }));
    }
    setEditingTable(null);
  }

  const editingColumns = creatingTable ? [] : editingTable ? columnsByTable[editingTable] ?? [] : [];

  return (
    <div className="glass relative h-[75vh] min-h-[520px] overflow-hidden rounded-xl border border-border shadow-panel">
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
        <Button size="sm" onClick={() => setCreatingTable(true)}>
          <Plus className="h-3.5 w-3.5" />
          New table
        </Button>
        <div className="glass flex items-center gap-0.5 rounded-lg border border-border p-1">
          <button
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.1).toFixed(2)))}
            aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center font-mono text-xs text-ink-faint">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.1).toFixed(2)))}
            aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoom(1)}
            aria-label="Reset zoom"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
          >
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="h-full w-full overflow-auto bg-canvas"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div
          style={{
            width: CANVAS_WIDTH * zoom,
            height: CANVAS_HEIGHT * zoom,
          }}
        >
          <div
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              position: "relative",
            }}
          >
            <SchemaEdges edges={edges} onSelectEdge={setSelectedEdge} selectedIndex={selectedEdge} />
            {tableNames.map((name) => {
              const pos = positions[name] ?? { x: 40, y: 40 };
              const columns = columnsByTable[name] ?? [];
              return (
                <SchemaNode
                  key={name}
                  name={name}
                  columns={columns}
                  x={pos.x}
                  y={pos.y}
                  selected={editingTable === name}
                  onMouseDownHeader={(e) => handleHeaderMouseDown(name, e)}
                  onEdit={() => setEditingTable(name)}
                />
              );
            })}
          </div>
        </div>
      </div>

      <TableEditDrawer
        open={editingTable !== null || creatingTable}
        onClose={() => {
          setEditingTable(null);
          setCreatingTable(false);
        }}
        tableName={creatingTable ? "" : editingTable ?? ""}
        columns={editingColumns}
        isNewTable={creatingTable}
        onSave={handleSaveColumns}
      />

      <RelationshipInspector
        fk={selectedEdge !== null ? edges[selectedEdge]?.fk ?? null : null}
        onClose={() => setSelectedEdge(null)}
      />
    </div>
  );
}
