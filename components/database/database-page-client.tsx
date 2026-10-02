"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DatabaseExplorer } from "@/components/database/database-explorer";
import { RealDatabaseExplorer } from "@/components/database/real-database-explorer";
import { SchemaCanvas } from "@/components/schema/schema-canvas";
import { RealSchemaCanvas } from "@/components/schema/real-schema-canvas";

type ViewMode = "explorer" | "live" | "schema" | "live-schema";

/**
 * Phase 5 — Schema Designer & Visualizer, updated in Phase 10
 * (Parts 2 & 3).
 *
 * `/database` has up to four whole-page views once a database is
 * connected:
 *  - "Live Database" (Phase 10, Part 2) -- real schema/table/row data,
 *    real CRUD. The default the moment a database is connected.
 *  - "Live Schema" (Phase 10, Part 3) -- every real table as a
 *    draggable node, real foreign keys as connector lines, real
 *    "New table" / add column / drop column DDL against your actual
 *    database.
 *  - "Explorer (demo)" / "Schema (demo)" (Phases 3-5, mock) -- the
 *    original mock experience, kept available for offline reference.
 */
export function DatabasePageClient({ databaseConfigured }: { databaseConfigured: boolean }) {
  const [mode, setMode] = useState<ViewMode>(databaseConfigured ? "live" : "explorer");

  const tabs = databaseConfigured
    ? [
        { value: "live", label: "Live Database" },
        { value: "live-schema", label: "Live Schema" },
        { value: "explorer", label: "Explorer (demo)" },
        { value: "schema", label: "Schema (demo)" },
      ]
    : [
        { value: "explorer", label: "Explorer" },
        { value: "schema", label: "Schema (demo)" },
      ];

  const isLiveMode = mode === "live" || mode === "live-schema";
  const description =
    mode === "live"
      ? "Browse your real schemas and tables."
      : mode === "live-schema"
        ? "See how your real tables relate to each other -- and create/edit them for real."
        : mode === "explorer"
          ? "Browse your schemas and tables."
          : "Preview a mock schema diagram; no database changes are made.";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-ink-muted">{description}</p>
          {mode === "schema" && !databaseConfigured && <Badge tone="warning">Demo data</Badge>}
          {!isLiveMode && databaseConfigured && <Badge tone="warning">Preview data</Badge>}
        </div>
        <Tabs items={tabs} value={mode} onChange={(v) => setMode(v as ViewMode)} />
      </div>

      {mode === "live" ? (
        <RealDatabaseExplorer />
      ) : mode === "live-schema" ? (
        <RealSchemaCanvas />
      ) : mode === "explorer" ? (
        <DatabaseExplorer />
      ) : (
        <SchemaCanvas />
      )}
    </>
  );
}
