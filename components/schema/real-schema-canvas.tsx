"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Plus, ZoomIn, ZoomOut, Maximize, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { SchemaNode } from "@/components/schema/schema-node";
import { computeEdges, SchemaEdges } from "@/components/schema/schema-edges";
import { RelationshipInspector } from "@/components/schema/relationship-inspector";
import { RealTableEditPanel } from "@/components/schema/real-table-edit-panel";
import type { TableColumn, ForeignKeyRef } from "@/lib/mock-data";
import type { RealColumn } from "@/lib/database/schema-service";

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 760;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const GRID_COLS = 4;
const GRID_GAP_X = 320;
const GRID_GAP_Y = 300;

function toMockColumn(col: RealColumn): TableColumn {
  return {
    name: col.name,
    type: col.type,
    nullable: col.nullable,
    isPrimaryKey: col.isPrimaryKey,
    isForeignKey: col.isForeignKey,
    default: col.default ?? undefined,
  };
}

/**
 * Phase 10 — Backend API & Real Data Integration (Part 3).
 *
 * The real counterpart to schema-canvas.tsx (kept for offline/demo
 * reference). Reuses that file's own `SchemaNode`/`computeEdges`/
 * `SchemaEdges`/`RelationshipInspector` directly -- they're already
 * pure/presentational, so real data just needs adapting to their
 * existing shapes rather than duplicating rendering logic.
 *
 * Scope note: table names are assumed unique across schemas for
 * diagram purposes (nodes/edges are keyed by bare table name, same as
 * the mock version) -- two different schemas with an identically
 * named table would collide on this canvas. Real, multi-schema-safe
 * keying is a reasonable follow-up, not done here.
 *
 * Layout positions are computed client-side (a simple grid) and kept
 * in component state only -- Postgres has no natural place to persist
 * "where you dragged this box," so this is honest, unpersisted UI
 * state, matching the mock version's own starting-position handling.
 */
export function RealSchemaCanvas() {
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState("");
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [columnsByTable, setColumnsByTable] = useState<Record<string, TableColumn[]>>({});
  const [realColumnsByTable, setRealColumnsByTable] = useState<Record<string, RealColumn[]>>({});
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyRef[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<{ name: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);

  const loadAll = useCallback(async (schemaOverride?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [schemaRes, tableRes] = await Promise.all([
        fetch("/api/database/schemas"),
        fetch("/api/database/schema"),
      ]);
      const schemaData = await schemaRes.json();
      const tableData = await tableRes.json();

      if (!schemaData.ok) {
        setError(schemaData.error === "not_configured" ? "Database not connected." : schemaData.error);
        return;
      }
      if (!tableData.ok) {
        setError(tableData.error ?? "Failed to load database tables.");
        return;
      }

      const availableSchemas = (schemaData.schemas as { name: string }[]).map((s) => s.name);
      setSchemas(availableSchemas);

      const nextSchema = schemaOverride ?? selectedSchema;
      const activeSchema = nextSchema && availableSchemas.includes(nextSchema)
        ? nextSchema
        : availableSchemas[0] ?? "";

      setSelectedSchema(activeSchema);

      const tables = (tableData.tables as { schema: string; name: string }[])
        .filter((t) => t.schema === activeSchema);

      const [columnResults, fkRes] = await Promise.all([
        Promise.all(
          tables.map((t) =>
            fetch(`/api/database/tables/${t.schema}/${t.name}`)
              .then((r) => r.json())
              .then((d) => ({ name: t.name, columns: d.ok ? (d.columns as RealColumn[]) : [] }))
          )
        ),
        fetch("/api/database/foreign-keys").then((r) => r.json()),
      ]);

      const nextColumnsByTable: Record<string, TableColumn[]> = {};
      const nextRealColumnsByTable: Record<string, RealColumn[]> = {};
      for (const { name, columns } of columnResults) {
        nextColumnsByTable[name] = columns.map(toMockColumn);
        nextRealColumnsByTable[name] = columns;
      }

      setColumnsByTable(nextColumnsByTable);
      setRealColumnsByTable(nextRealColumnsByTable);
      setTableNames(tables.map((t) => t.name));

      if (fkRes.ok) {
        const allFks = fkRes.foreignKeys as {
          schema: string;
          table: string;
          column: string;
          refSchema: string;
          refTable: string;
          refColumn: string;
        }[];

        // Keep this diagram schema-local so identical table names in
        // different schemas cannot collide in the existing node model.
        setForeignKeys(
          allFks
            .filter((fk) => fk.schema === activeSchema && fk.refSchema === activeSchema)
            .map((fk) => ({
              table: fk.table,
              column: fk.column,
              refTable: fk.refTable,
              refColumn: fk.refColumn,
            }))
        );
      } else {
        setForeignKeys([]);
      }

      setPositions((prev) => {
        const next = { ...prev };
        tables.forEach((t, i) => {
          if (!next[t.name]) {
            next[t.name] = { x: (i % GRID_COLS) * GRID_GAP_X + 40, y: Math.floor(i / GRID_COLS) * GRID_GAP_Y + 40 };
          }
        });
        return next;
      });
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [selectedSchema]);
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const edges = useMemo(() => computeEdges(foreignKeys, positions, columnsByTable), [foreignKeys, positions, columnsByTable]);

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

  if (error) {
    return (
      <div className="glass flex h-[75vh] min-h-[520px] items-center justify-center rounded-xl border border-border shadow-panel">
        <ErrorState description={error} />
      </div>
    );
  }

  return (
    <div className="glass relative h-[75vh] min-h-[520px] overflow-hidden rounded-xl border border-border shadow-panel">
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
        {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
        <select
          value={selectedSchema}
          onChange={(e) => {
            setPositions({});
            setSelectedEdge(null);
            void loadAll(e.target.value);
          }}
          disabled={schemas.length === 0 || loading}
          aria-label="Schema"
          className="h-8 rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink focus:border-accent-line focus:outline-none disabled:opacity-50"
        >
          {schemas.length === 0 ? <option value="">No schemas</option> : schemas.map((schema) => <option key={schema} value={schema}>{schema}</option>)}
        </select>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
        <Button size="sm" disabled={!selectedSchema} onClick={() => setCreatingTable(true)}>
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
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="h-full w-full overflow-auto bg-canvas"
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
      >
        <div style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}>
          <div style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${zoom})`, transformOrigin: "top left", position: "relative" }}>
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

      <RealTableEditPanel
        open={editingTable !== null}
        onClose={() => setEditingTable(null)}
        mode="edit"
        schema={selectedSchema}
        table={editingTable ?? ""}
        existingColumns={editingTable ? realColumnsByTable[editingTable] ?? [] : []}
        onChanged={() => void loadAll()}
      />
      <RealTableEditPanel
        open={creatingTable}
        onClose={() => setCreatingTable(false)}
        mode="create"
        schema={selectedSchema}
        table=""
        existingColumns={[]}
        onChanged={() => void loadAll()}
      />

      <RelationshipInspector
        fk={selectedEdge !== null ? edges[selectedEdge]?.fk ?? null : null}
        onClose={() => setSelectedEdge(null)}
      />
    </div>
  );
}
