"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { RealDatabaseExplorer } from "@/components/database/real-database-explorer";
import { RealSchemaCanvas } from "@/components/schema/real-schema-canvas";

type ViewMode = "live" | "live-schema";

/**
 * Phase 5 — Schema Designer & Visualizer, updated in Phase 10
 * (Parts 2 & 3).
 *
 * `/database` has two production views, both backed by the real
 * PostgreSQL connection:
 *  - "Live Database" -- real schema/table/row data, real CRUD.
 *  - "Live Schema" -- every real table as a draggable node, real
 *    foreign keys as connector lines, real DDL.
 *
 * The original mock Explorer / Schema canvas components remain in the
 * repository as developer reference only and are not linked from
 * production navigation.
 */
export function DatabasePageClient({ databaseConfigured }: { databaseConfigured: boolean }) {
  const [mode, setMode] = useState<ViewMode>("live");

  const tabs = [
    { value: "live", label: "Database" },
    { value: "live-schema", label: "Schema" },
  ];

  const description =
    mode === "live"
      ? "Browse your real schemas and tables."
      : "See how your real tables relate to each other -- and create/edit them for real.";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-ink-muted">{description}</p>
          {!databaseConfigured && (
            <p className="text-xs text-warning">Database is not connected. Connect it to load live data.</p>
          )}
        </div>
        <Tabs items={tabs} value={mode} onChange={(v) => setMode(v as ViewMode)} />
      </div>

      {mode === "live" ? (
        <RealDatabaseExplorer />
      ) : (
        <RealSchemaCanvas />
      )}
    </>
  );
}
