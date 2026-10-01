"use client";

import { useState } from "react";
import { Play, Bookmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { SqlEditor } from "@/components/queries/sql-editor";
import { QueryResults } from "@/components/queries/query-results";
import { QueryTabs, type QueryTab } from "@/components/queries/query-tabs";
import { QueryHistoryPanel, type SavedQuery } from "@/components/queries/query-history-panel";
import { runMockQuery, type QueryOutcome } from "@/lib/sql-mock-engine";
import { queryHistory as seedHistory, type QueryHistoryItem } from "@/lib/mock-data";

let tabCounter = 1;
function newTab(sql = ""): QueryTab {
  tabCounter += 1;
  return { id: `tab-${tabCounter}`, name: `Query ${tabCounter}`, sql };
}

const SEED_SAVED: SavedQuery[] = [
  { id: "sq1", name: "Active users", sql: "select id, email, full_name from users where last_active is not null;" },
  { id: "sq2", name: "In-stock products", sql: "select name, category, price_cents from products where in_stock = true;" },
];

/**
 * Phase 6 — Advanced SQL Editor & Results.
 * Owns everything: which tab is active, each tab's SQL and last
 * result, session query history (seeded from lib/mock-data.ts's
 * `queryHistory`, then real runs get prepended), and saved queries.
 * All in component state -- nothing persists across a refresh yet,
 * same honesty as every other phase (Phase 10 is what changes that).
 */
export function QueriesWorkspace({ currentUserEmail }: { currentUserEmail: string }) {
  const [tabs, setTabs] = useState<QueryTab[]>([{ id: "tab-1", name: "Query 1", sql: "select * from users limit 10;" }]);
  const [activeId, setActiveId] = useState("tab-1");
  const [outcomes, setOutcomes] = useState<Record<string, QueryOutcome | null>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<QueryHistoryItem[]>(seedHistory);
  const [saved, setSaved] = useState<SavedQuery[]>(SEED_SAVED);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const activeOutcome = outcomes[activeTab.id] ?? null;
  const isLoading = loadingIds.has(activeTab.id);

  function updateSql(sql: string) {
    setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? { ...t, sql } : t)));
  }

  function addTab() {
    const tab = newTab();
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId && next.length > 0) setActiveId(next[next.length - 1].id);
      return next;
    });
  }

  async function handleRun() {
    const tabId = activeTab.id;
    const sql = activeTab.sql;
    setLoadingIds((prev) => new Set(prev).add(tabId));

    const outcome = await runMockQuery(sql);

    setOutcomes((prev) => ({ ...prev, [tabId]: outcome }));
    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    setHistory((prev) => [
      {
        id: `qh_${Date.now()}`,
        sql,
        status: outcome.ok ? "success" : "error",
        rows: outcome.ok ? outcome.rowCount : null,
        durationMs: outcome.durationMs,
        ranAt: new Date().toISOString(),
        ranBy: currentUserEmail,
      },
      ...prev,
    ]);
  }

  function handleLoadIntoActive(sql: string) {
    updateSql(sql);
  }

  function handleSave() {
    if (!saveName.trim()) return;
    setSaved((prev) => [...prev, { id: `sq_${Date.now()}`, name: saveName.trim(), sql: activeTab.sql }]);
    setSaveModalOpen(false);
    setSaveName("");
  }

  return (
    <div className="glass grid h-[75vh] min-h-[520px] grid-cols-[240px_1fr] overflow-hidden rounded-xl border border-border shadow-panel">
      <div className="border-r border-border">
        <QueryHistoryPanel
          history={history}
          saved={saved}
          onLoad={handleLoadIntoActive}
          onRemoveSaved={(id) => setSaved((prev) => prev.filter((s) => s.id !== id))}
        />
      </div>

      <div className="flex min-w-0 flex-col">
        <QueryTabs tabs={tabs} activeId={activeTab.id} onSelect={setActiveId} onClose={closeTab} onAdd={addTab} />

        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button size="sm" onClick={handleRun} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSaveModalOpen(true)}>
            <Bookmark className="h-3.5 w-3.5" />
            Save
          </Button>
          <span className="ml-auto text-[11px] text-ink-faint">⌘/Ctrl + Enter to run</span>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-border">
          <SqlEditor value={activeTab.sql} onChange={updateSql} onRun={handleRun} />
          <QueryResults outcome={activeOutcome} loading={isLoading} />
        </div>
      </div>

      <Modal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Save query"
        description="Give this query a name to find it later."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!saveName.trim()}>
              Save
            </Button>
          </>
        }
      >
        <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Active users" autoFocus />
      </Modal>
    </div>
  );
}
