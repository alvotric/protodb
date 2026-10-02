"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { LayoutGrid, Plus, ZoomIn, ZoomOut, Maximize, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { SchemaNode, NODE_WIDTH, nodeHeight } from "@/components/schema/schema-node";
import { computeEdges, schemaTableKey, SchemaEdges } from "@/components/schema/schema-edges";
import { RelationshipInspector } from "@/components/schema/relationship-inspector";
import { RealTableEditPanel } from "@/components/schema/real-table-edit-panel";
import type { TableColumn, ForeignKeyRef } from "@/lib/mock-data";
import type { RealColumn, RealTableSummary } from "@/lib/database/schema-service";

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 760;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const GRID_COLS = 4;
const GRID_GAP_X = 320;
const GRID_GAP_Y = 80;
const POSITION_STORAGE_KEY = "protodb.schema-designer.positions.v1";

interface DiagramTable {
  schema: string;
  name: string;
  key: string;
  isPartitioned: boolean;
}

function toDiagramTable(table: RealTableSummary): DiagramTable {
  return {
    schema: table.schema,
    name: table.name,
    key: schemaTableKey(table.schema, table.name),
    isPartitioned: table.isPartitioned,
  };
}

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

function readSavedPositions(): Record<string, { x: number; y: number }> {
  const stored = window.localStorage.getItem(POSITION_STORAGE_KEY);
  if (!stored) return {};
  const parsed: unknown = JSON.parse(stored);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (
      value && typeof value === "object" &&
      typeof (value as { x?: unknown }).x === "number" && Number.isFinite((value as { x: number }).x) &&
      typeof (value as { y?: unknown }).y === "number" && Number.isFinite((value as { y: number }).y)
    ) {
      positions[key] = { x: Math.max(0, (value as { x: number }).x), y: Math.max(0, (value as { y: number }).y) };
    }
  }
  return positions;
}

function initialPositions(
  tables: DiagramTable[],
  columns: Record<string, TableColumn[]>,
  saved: Record<string, { x: number; y: number }>
): Record<string, { x: number; y: number }> {
  const result = { ...saved };
  const rowHeights: number[] = [];
  tables.forEach((table, index) => {
    const row = Math.floor(index / GRID_COLS);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, nodeHeight(columns[table.key]?.length ?? 0));
    if (!result[table.key]) result[table.key] = { x: (index % GRID_COLS) * GRID_GAP_X + 40, y: 40 };
  });
  let rowTop = 40;
  for (let row = 0; row < rowHeights.length; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const table = tables[row * GRID_COLS + col];
      if (table && !saved[table.key]) result[table.key] = { x: col * GRID_GAP_X + 40, y: rowTop };
    }
    rowTop += (rowHeights[row] ?? 0) + GRID_GAP_Y;
  }
  return result;
}

export function RealSchemaCanvas() {
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState("");
  const selectedSchemaRef = useRef("");
  const [allTables, setAllTables] = useState<RealTableSummary[]>([]);
  const [diagramTables, setDiagramTables] = useState<DiagramTable[]>([]);
  const [columnsByTable, setColumnsByTable] = useState<Record<string, TableColumn[]>>({});
  const [realColumnsByTable, setRealColumnsByTable] = useState<Record<string, RealColumn[]>>({});
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyRef[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [positionsReady, setPositionsReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [metadataIssues, setMetadataIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ key: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [editingTable, setEditingTable] = useState<DiagramTable | null>(null);
  const [editingForeignKey, setEditingForeignKey] = useState<ForeignKeyRef | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [removingForeignKey, setRemovingForeignKey] = useState(false);
  const [foreignKeyError, setForeignKeyError] = useState<string | null>(null);

  const loadAll = useCallback(async (schemaOverride?: string) => {
    setLoading(true);
    setError(null);
    const issues: string[] = [];
    try {
      const [schemaRes, tableRes] = await Promise.all([
        fetch("/api/database/schemas"),
        fetch("/api/database/schema?includePartitioned=true"),
      ]);
      const [schemaData, tableData] = await Promise.all([schemaRes.json(), tableRes.json()]);

      if (!schemaRes.ok || !schemaData.ok) {
        setError(schemaData.error === "not_configured" ? "Database not connected." : schemaData.error ?? "Failed to load schemas.");
        return;
      }
      if (!tableRes.ok || !tableData.ok) {
        setError(tableData.error ?? "Failed to load database tables.");
        return;
      }

      const availableSchemas = (schemaData.schemas as { name: string }[]).map((item) => item.name);
      const availableTables = tableData.tables as RealTableSummary[];
      setSchemas(availableSchemas);
      setAllTables(availableTables);

      const nextSchema = schemaOverride ?? selectedSchemaRef.current;
      const activeSchema = nextSchema && availableSchemas.includes(nextSchema)
        ? nextSchema
        : availableSchemas[0] ?? "";
      setSelectedSchema(activeSchema);
      selectedSchemaRef.current = activeSchema;

      const fkRes = await fetch("/api/database/foreign-keys");
      let activeForeignKeys: ForeignKeyRef[] = [];
      let fkData: { ok?: boolean; error?: string; foreignKeys?: unknown } | null = null;
      try {
        fkData = await fkRes.json();
      } catch {
        issues.push("Foreign-key metadata returned an invalid response.");
      }
      if (!fkRes.ok || !fkData?.ok || !Array.isArray(fkData.foreignKeys)) {
        issues.push(fkData?.error ?? "Foreign-key metadata could not be loaded.");
      } else {
        const allForeignKeys = fkData.foreignKeys as ForeignKeyRef[];
        activeForeignKeys = allForeignKeys.filter((fk) => fk.schema === activeSchema || fk.refSchema === activeSchema);
      }

      const selected = new Map<string, DiagramTable>();
      for (const table of availableTables.filter((item) => item.schema === activeSchema)) {
        const diagramTable = toDiagramTable(table);
        selected.set(diagramTable.key, diagramTable);
      }
      for (const fk of activeForeignKeys) {
        for (const endpoint of [
          { schema: fk.schema, name: fk.table },
          { schema: fk.refSchema, name: fk.refTable },
        ]) {
          const table = availableTables.find((item) => item.schema === endpoint.schema && item.name === endpoint.name);
          if (table) selected.set(schemaTableKey(table.schema, table.name), toDiagramTable(table));
          else issues.push(`Referenced table "${endpoint.schema}.${endpoint.name}" is not present in table metadata.`);
        }
      }
      const tables = [...selected.values()].sort((a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name));

      const columnResults = await Promise.all(tables.map(async (table) => {
        try {
          const response = await fetch(`/api/database/tables/${encodeURIComponent(table.schema)}/${encodeURIComponent(table.name)}`);
          const data = await response.json();
          if (!response.ok || !data.ok || !Array.isArray(data.columns)) {
            throw new Error(data.error ?? "Table metadata request failed.");
          }
          return { table, columns: data.columns as RealColumn[] };
        } catch (err) {
          issues.push(`Columns for "${table.schema}.${table.name}" are unavailable: ${err instanceof Error ? err.message : "request failed"}`);
          return { table, columns: null };
        }
      }));

      const nextColumnsByTable: Record<string, TableColumn[]> = {};
      const nextRealColumnsByTable: Record<string, RealColumn[]> = {};
      for (const result of columnResults) {
        if (!result.columns) continue;
        nextColumnsByTable[result.table.key] = result.columns.map(toMockColumn);
        nextRealColumnsByTable[result.table.key] = result.columns;
      }

      setDiagramTables(tables);
      setColumnsByTable(nextColumnsByTable);
      setRealColumnsByTable(nextRealColumnsByTable);
      setForeignKeys(activeForeignKeys);
      setMetadataIssues(issues);
      setSelectedEdge(null);

      let saved: Record<string, { x: number; y: number }> = {};
      try {
        saved = readSavedPositions();
      } catch {
        setStorageError("Saved node positions could not be read from this browser.");
      }
      setPositions((prev) => initialPositions(tables, nextColumnsByTable, { ...prev, ...saved }));
      setPositionsReady(true);
    } catch {
      setError("Couldn't reach the server while loading schema metadata.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!positionsReady) return;
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(positions));
      setStorageError(null);
    } catch {
      setStorageError("Node positions could not be saved in this browser.");
    }
  }, [positions, positionsReady]);

  const edges = useMemo(
    () => computeEdges(foreignKeys, positions, columnsByTable),
    [foreignKeys, positions, columnsByTable]
  );

  function handleHeaderMouseDown(key: string, e: MouseEvent) {
    e.preventDefault();
    const pos = positions[key] ?? { x: 40, y: 40 };
    setDragging({ key, startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y });
  }

  function handleCanvasMouseDown(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-schema-node], [data-schema-edge]")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    setPanning({ startX: e.clientX, startY: e.clientY, originX: pan.x, originY: pan.y });
  }

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (dragging) {
      const dx = (e.clientX - dragging.startX) / zoom;
      const dy = (e.clientY - dragging.startY) / zoom;
      setPositions((prev) => ({
        ...prev,
        [dragging.key]: { x: Math.max(0, dragging.originX + dx), y: Math.max(0, dragging.originY + dy) },
      }));
    } else if (panning) {
      setPan({ x: panning.originX + e.clientX - panning.startX, y: panning.originY + e.clientY - panning.startY });
    }
  }

  function handleMouseUp() {
    setDragging(null);
    setPanning(null);
  }

  function autoLayout() {
    const degree = new Map<string, number>();
    for (const fk of foreignKeys) {
      const source = schemaTableKey(fk.schema, fk.table);
      const target = schemaTableKey(fk.refSchema, fk.refTable);
      degree.set(source, (degree.get(source) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    }
    const ordered = [...diagramTables].sort((a, b) =>
      (degree.get(b.key) ?? 0) - (degree.get(a.key) ?? 0) || a.key.localeCompare(b.key)
    );
    const rowHeights: number[] = [];
    ordered.forEach((table, index) => {
      const row = Math.floor(index / GRID_COLS);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, nodeHeight(columnsByTable[table.key]?.length ?? 0));
    });
    const next: Record<string, { x: number; y: number }> = {};
    let rowTop = 40;
    for (let row = 0; row < rowHeights.length; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const table = ordered[row * GRID_COLS + col];
        if (table) next[table.key] = { x: col * GRID_GAP_X + 40, y: rowTop };
      }
      rowTop += (rowHeights[row] ?? 0) + GRID_GAP_Y;
    }
    setPositions((prev) => ({ ...prev, ...next }));
    setPan({ x: 0, y: 0 });
  }

  async function removeSelectedForeignKey(): Promise<boolean> {
    const fk = selectedEdge === null ? null : edges[selectedEdge]?.fk;
    if (!fk?.schema || !fk.constraintName) return false;
    setRemovingForeignKey(true);
    setForeignKeyError(null);
    try {
      const response = await fetch("/api/database/foreign-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: fk.schema, table: fk.table, constraintName: fk.constraintName }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to remove the foreign key.");
      setSelectedEdge(null);
      await loadAll(selectedSchema);
      return true;
    } catch (err) {
      setForeignKeyError(err instanceof Error ? err.message : "Couldn't reach the server.");
      return false;
    } finally {
      setRemovingForeignKey(false);
    }
  }

  function editSelectedForeignKey() {
    const fk = selectedEdge === null ? null : edges[selectedEdge]?.fk;
    if (!fk?.schema || !fk.columns || fk.columns.length !== 1) return;
    const source = diagramTables.find((table) => table.schema === fk.schema && table.name === fk.table);
    if (!source || !realColumnsByTable[source.key]) return;
    setEditingForeignKey(fk);
    setEditingTable(source);
    setSelectedEdge(null);
  }

  if (error) {
    return (
      <div className="glass flex h-[75vh] min-h-[520px] items-center justify-center rounded-xl border border-border shadow-panel">
        <ErrorState description={error} />
      </div>
    );
  }

  const canvasWidth = Math.max(CANVAS_WIDTH, ...diagramTables.map((table) => (positions[table.key]?.x ?? 0) + NODE_WIDTH + 40));
  const canvasHeight = Math.max(CANVAS_HEIGHT, ...diagramTables.map((table) => (positions[table.key]?.y ?? 0) + nodeHeight(columnsByTable[table.key]?.length ?? 0) + 40));

  return (
    <div className="glass relative h-[75vh] min-h-[520px] overflow-hidden rounded-xl border border-border shadow-panel">
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
        {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" aria-label="Loading schema" />}
        <select
          value={selectedSchema}
          onChange={(e) => {
            setSelectedEdge(null);
            setPan({ x: 0, y: 0 });
            void loadAll(e.target.value);
          }}
          disabled={schemas.length === 0 || loading}
          aria-label="Schema"
          className="h-8 rounded-lg border border-border bg-surface px-2 font-mono text-xs text-ink focus:border-accent-line focus:outline-none disabled:opacity-50"
        >
          {schemas.length === 0 ? <option value="">No schemas</option> : schemas.map((schema) => <option key={schema} value={schema}>{schema}</option>)}
        </select>
        <Button size="sm" variant="secondary" disabled={diagramTables.length === 0 || loading} onClick={autoLayout}>
          <LayoutGrid className="h-3.5 w-3.5" />
          Auto layout
        </Button>
        <Button size="sm" disabled={!selectedSchema || loading} onClick={() => setCreatingTable(true)}>
          <Plus className="h-3.5 w-3.5" />
          New table
        </Button>
        <div className="glass flex items-center gap-0.5 rounded-lg border border-border p-1">
          <button onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.1).toFixed(2)))} aria-label="Zoom out" className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center font-mono text-xs text-ink-faint">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.1).toFixed(2)))} aria-label="Zoom in" className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset zoom and pan" className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink">
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {(metadataIssues.length > 0 || storageError) && (
        <div role="status" className="absolute left-3 top-3 z-20 max-w-[40%] space-y-1 rounded-lg border border-amber-500/40 bg-surface/95 p-2 text-xs text-amber-300">
          {metadataIssues.map((issue, index) => <p key={`${index}.${issue}`}>Diagram may be incomplete: {issue}</p>)}
          {storageError && <p>{storageError}</p>}
        </div>
      )}

      <div
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`h-full w-full overflow-auto bg-canvas ${panning ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
      >
        {loading && diagramTables.length === 0 ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading schema metadata…
          </div>
        ) : diagramTables.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-ink">No tables in this schema</p>
            <p className="text-xs text-ink-muted">Create a table to begin designing this schema.</p>
          </div>
        ) : (
          <div style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
            <div
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "top left",
                position: "relative",
              }}
            >
              <SchemaEdges edges={edges} onSelectEdge={setSelectedEdge} selectedIndex={selectedEdge} />
              {diagramTables.map((table) => {
                const pos = positions[table.key] ?? { x: 40, y: 40 };
                const columns = columnsByTable[table.key] ?? [];
                return (
                  <SchemaNode
                    key={table.key}
                    name={table.schema === selectedSchema ? table.name : `${table.schema}.${table.name}`}
                    columns={columns}
                    isPartitioned={table.isPartitioned}
                    editable={realColumnsByTable[table.key] !== undefined}
                    x={pos.x}
                    y={pos.y}
                    selected={editingTable?.key === table.key}
                    onMouseDownHeader={(event) => handleHeaderMouseDown(table.key, event)}
                    onEdit={() => setEditingTable(table)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {editingTable && (
        <RealTableEditPanel
          open
          onClose={() => { setEditingTable(null); setEditingForeignKey(null); }}
          mode="edit"
          schema={editingTable.schema}
          table={editingTable.name}
          existingColumns={realColumnsByTable[editingTable.key] ?? []}
          schemas={schemas}
          tables={allTables}
          initialForeignKey={editingForeignKey}
          onChanged={() => void loadAll(selectedSchema)}
        />
      )}
      <RealTableEditPanel
        open={creatingTable}
        onClose={() => setCreatingTable(false)}
        mode="create"
        schema={selectedSchema}
        table=""
        existingColumns={[]}
        schemas={schemas}
        tables={allTables}
        onChanged={() => void loadAll(selectedSchema)}
      />

      <RelationshipInspector
        fk={selectedEdge !== null ? edges[selectedEdge]?.fk ?? null : null}
        onClose={() => setSelectedEdge(null)}
        onEdit={selectedEdge !== null && edges[selectedEdge]?.fk.columns?.length === 1 ? editSelectedForeignKey : undefined}
        onRemove={removeSelectedForeignKey}
        removing={removingForeignKey}
        removeError={foreignKeyError}
      />
    </div>
  );
}
