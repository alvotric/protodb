"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Bookmark, Loader2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { SqlEditor } from "@/components/queries/sql-editor";
import { QueryResults } from "@/components/queries/query-results";
import { QueryTabs, type QueryTab } from "@/components/queries/query-tabs";
import { QueryHistoryPanel, type SavedQuery } from "@/components/queries/query-history-panel";
import { runMockQuery } from "@/lib/sql-mock-engine";
import { tables, tableColumns, queryHistory as seedHistory } from "@/lib/mock-data";
import { isQueryOutcome, isScriptOutcome, type QueryHistoryRecord, type QueryOutcome, type ScriptOutcome, type ScriptTransactionMode } from "@/lib/queries/types";

type DisplayOutcome = (QueryOutcome | ScriptOutcome) & { source: "live" | "demo" };

interface ApiSavedQuery {
  id: string;
  name: string;
  sql: string;
  created_at?: string;
  createdAt?: string;
}

let tabCounter = 1;
function newTab(sql = ""): QueryTab {
  tabCounter += 1;
  return { id: `tab-${tabCounter}`, name: `Query ${tabCounter}`, sql };
}

const SEED_SAVED: SavedQuery[] = [
  { id: "sq1", name: "Active users", sql: "select id, email, full_name from users where last_active is not null;" },
  { id: "sq2", name: "In-stock products", sql: "select name, category, price_cents from products where in_stock = true;" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isApiSavedQuery(value: unknown): value is ApiSavedQuery {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.sql === "string";
}

function historyFromApi(value: unknown): QueryHistoryRecord[] | null {
  if (!isRecord(value) || !Array.isArray(value.history)) return null;
  const records: QueryHistoryRecord[] = [];
  for (const item of value.history) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.sql !== "string" ||
      (item.status !== "success" && item.status !== "error") ||
      typeof item.durationMs !== "number" ||
      typeof item.ranAt !== "string"
    ) return null;
    records.push({
      id: item.id,
      sql: item.sql,
      status: item.status,
      rows: typeof item.rows === "number" ? item.rows : null,
      durationMs: item.durationMs,
      error: typeof item.error === "string" ? item.error : null,
      errorPosition: typeof item.errorPosition === "number" ? item.errorPosition : null,
      ranAt: item.ranAt,
    });
  }
  return records;
}

function savedFromApi(value: unknown): SavedQuery[] | null {
  if (!isRecord(value) || !Array.isArray(value.saved)) return null;
  const saved: SavedQuery[] = [];
  for (const item of value.saved) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.sql !== "string") return null;
    saved.push({
      id: item.id,
      name: item.name,
      sql: item.sql,
      createdAt: typeof item.created_at === "string" ? item.created_at : undefined,
    });
  }
  return saved;
}

async function responseError(response: Response, body: unknown): Promise<string> {
  if (isRecord(body) && typeof body.error === "string") return body.error;
  return `Request failed (${response.status}).`;
}

export function QueriesWorkspace({
  databaseConfigured,
  canRunSql,
}: {
  databaseConfigured: boolean;
  canRunSql: boolean;
}) {
  const [tabs, setTabs] = useState<QueryTab[]>(() => [{
    id: "tab-1",
    name: "Query 1",
    sql: databaseConfigured ? "select 1;" : "select * from users limit 10;",
  }]);
  const [activeId, setActiveId] = useState("tab-1");
  const [outcomes, setOutcomes] = useState<Record<string, DisplayOutcome | null>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<QueryHistoryRecord[]>([]);
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [historyLoading, setHistoryLoading] = useState(databaseConfigured);
  const [savedLoading, setSavedLoading] = useState(databaseConfigured);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataTruncated, setMetadataTruncated] = useState(false);
  const [busySavedId, setBusySavedId] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingQuery, setSavingQuery] = useState(false);
  const [queryWarning, setQueryWarning] = useState<string | null>(null);
  const [focusErrorToken, setFocusErrorToken] = useState(0);
  const [runMode, setRunMode] = useState<"statement" | "script">("statement");
  const [transactionMode, setTransactionMode] = useState<ScriptTransactionMode>("transaction");

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0] ?? { id: "tab-1", name: "Query 1", sql: "" };
  const activeOutcome = outcomes[activeTab.id] ?? null;
  const isLoading = loadingIds.has(activeTab.id);

  const loadHistory = useCallback(async () => {
    if (!databaseConfigured) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch("/api/queries/history");
      const body: unknown = await response.json().catch(() => null);
      const records = historyFromApi(body);
      if (!response.ok || !records) throw new Error(await responseError(response, body));
      setHistory(records);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not load query history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [databaseConfigured]);

  const loadSaved = useCallback(async () => {
    if (!databaseConfigured) return;
    setSavedLoading(true);
    setSavedError(null);
    try {
      const response = await fetch("/api/queries/saved");
      const body: unknown = await response.json().catch(() => null);
      const items = savedFromApi(body);
      if (!response.ok || !items) throw new Error(await responseError(response, body));
      setSaved(items);
    } catch (error) {
      setSavedError(error instanceof Error ? error.message : "Could not load saved queries.");
    } finally {
      setSavedLoading(false);
    }
  }, [databaseConfigured]);

  const loadMetadata = useCallback(async () => {
    if (!databaseConfigured) return;
    setMetadataError(null);
    try {
      const response = await fetch("/api/queries/metadata");
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(body) || !Array.isArray(body.identifiers) ||
          !body.identifiers.every((identifier) => typeof identifier === "string")) {
        throw new Error(await responseError(response, body));
      }
      setIdentifiers(body.identifiers);
      setMetadataTruncated(body.truncated === true);
    } catch (error) {
      setIdentifiers([]);
      setMetadataTruncated(false);
      setMetadataError(error instanceof Error ? error.message : "Could not load database autocomplete metadata.");
    }
  }, [databaseConfigured]);

  useEffect(() => {
    if (!databaseConfigured) {
      setHistory(seedHistory.map((item) => ({
        id: item.id,
        sql: item.sql,
        status: item.status === "error" ? "error" : "success",
        rows: item.rows,
        durationMs: item.durationMs ?? 0,
        error: null,
        errorPosition: null,
        ranAt: item.ranAt,
      })));
      setSaved(SEED_SAVED);
      setIdentifiers([
        ...tables.map((table) => table.name),
        ...Object.values(tableColumns).flatMap((columns) => columns.map((column) => column.name)),
      ]);
      return;
    }
    void loadHistory();
    void loadSaved();
    void loadMetadata();
  }, [databaseConfigured, loadHistory, loadMetadata, loadSaved]);

  function updateSql(tabId: string, sql: string) {
    setTabs((previous) => previous.map((tab) => tab.id === tabId ? { ...tab, sql } : tab));
  }

  function addTab() {
    const tab = newTab();
    setTabs((previous) => [...previous, tab]);
    setActiveId(tab.id);
  }

  function closeTab(id: string) {
    setTabs((previous) => {
      const next = previous.filter((tab) => tab.id !== id);
      if (id === activeId && next.length > 0) setActiveId(next[next.length - 1].id);
      return next;
    });
    setOutcomes((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setLoadingIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  }

  async function handleRun(mode: "statement" | "script" = runMode) {
    const tabId = activeTab.id;
    const sql = activeTab.sql;
    if (loadingIds.has(tabId)) return;
    setQueryWarning(null);
    setLoadingIds((previous) => new Set(previous).add(tabId));
    const started = performance.now();

    try {
      let outcome: DisplayOutcome;
      if (!databaseConfigured) {
        const demo = await runMockQuery(sql);
        outcome = demo.ok
          ? {
              ok: true,
              source: "demo",
              columns: demo.columns,
              rows: demo.rows,
              rowCount: demo.rowCount,
              durationMs: demo.durationMs,
              truncated: false,
            }
          : { ...demo, source: "demo" };
        if (mode === "script") {
          setQueryWarning("Demo mode runs only the mock single-statement engine; connect a database to run multi-statement scripts.");
        }
      } else if (!canRunSql) {
        outcome = {
          ok: false,
          source: "live",
          message: "Your role is not authorized to execute SQL.",
          durationMs: 0,
        };
      } else if (mode === "script") {
        const response = await fetch("/api/queries/execute-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql, transactionMode }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (isRecord(body) && isScriptOutcome(body.outcome)) {
          outcome = { ...body.outcome, source: "live" };
          if (typeof body.historyWarning === "string") setQueryWarning(body.historyWarning);
        } else {
          outcome = {
            ok: false,
            source: "live",
            message: await responseError(response, body),
            durationMs: Math.round(performance.now() - started),
          };
        }
      } else {
        const response = await fetch("/api/queries/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (isRecord(body) && isQueryOutcome(body.outcome)) {
          outcome = { ...body.outcome, source: "live" };
          if (typeof body.historyWarning === "string") setQueryWarning(body.historyWarning);
        } else {
          outcome = {
            ok: false,
            source: "live",
            message: await responseError(response, body),
            durationMs: Math.round(performance.now() - started),
          };
        }
      }

      setOutcomes((previous) => ({ ...previous, [tabId]: outcome }));
      if (databaseConfigured) void loadHistory();
      else if (outcome.source === "demo" && !isScriptOutcome(outcome)) {
        const item: QueryHistoryRecord = {
          id: `demo-${Date.now()}`,
          sql,
          status: outcome.ok ? "success" : "error",
          rows: outcome.ok ? outcome.rowCount : null,
          durationMs: outcome.durationMs,
          error: outcome.ok ? null : outcome.message,
          errorPosition: outcome.ok ? null : outcome.position ?? null,
          ranAt: new Date().toISOString(),
        };
        setHistory((previous) => [item, ...previous]);
      }
    } catch (error) {
      setOutcomes((previous) => ({
        ...previous,
        [tabId]: {
          ok: false,
          source: databaseConfigured ? "live" : "demo",
          message: error instanceof Error ? error.message : "Could not execute the query.",
          durationMs: Math.round(performance.now() - started),
        },
      }));
    } finally {
      setLoadingIds((previous) => {
        const next = new Set(previous);
        next.delete(tabId);
        return next;
      });
    }
  }

  async function handleSave() {
    const name = saveName.trim();
    if (!name || !activeTab.sql.trim()) return;
    setSavingQuery(true);
    setSaveError(null);
    try {
      if (!databaseConfigured) {
        setSaved((previous) => [...previous, { id: `demo-${Date.now()}`, name, sql: activeTab.sql }]);
      } else {
        const response = await fetch("/api/queries/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, sql: activeTab.sql }),
        });
        const body: unknown = await response.json().catch(() => null);
        const savedItem = isRecord(body) ? body.saved : null;
        if (!response.ok || !isApiSavedQuery(savedItem)) {
          throw new Error(await responseError(response, body));
        }
        setSaved((previous) => [{
          id: savedItem.id,
          name: savedItem.name,
          sql: savedItem.sql,
        }, ...previous]);
      }
      setSaveModalOpen(false);
      setSaveName("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save the query.");
    } finally {
      setSavingQuery(false);
    }
  }

  async function handleRemoveSaved(id: string) {
    if (!databaseConfigured) {
      setSaved((previous) => previous.filter((item) => item.id !== id));
      return;
    }
    setBusySavedId(id);
    setSavedError(null);
    try {
      const response = await fetch(`/api/queries/saved/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(await responseError(response, body));
      setSaved((previous) => previous.filter((item) => item.id !== id));
    } catch (error) {
      setSavedError(error instanceof Error ? error.message : "Could not delete the saved query.");
    } finally {
      setBusySavedId(null);
    }
  }

  const errorLocation = activeOutcome && !activeOutcome.ok && "location" in activeOutcome
    ? (activeOutcome as { location?: { offset: number } | undefined }).location?.offset ?? null
    : null;

  return (
    <div className="glass grid h-[75vh] min-h-[520px] grid-cols-[240px_1fr] overflow-hidden rounded-xl border border-border shadow-panel">
      <div className="border-r border-border">
        <QueryHistoryPanel
          history={history}
          saved={saved}
          onLoad={(sql) => updateSql(activeTab.id, sql)}
          onRemoveSaved={(id) => void handleRemoveSaved(id)}
          historyLoading={historyLoading}
          historyError={historyError}
          savedLoading={savedLoading}
          savedError={savedError}
          busySavedId={busySavedId}
          onRetry={() => { void loadHistory(); void loadSaved(); }}
        />
      </div>

      <div className="flex min-w-0 flex-col">
        <QueryTabs tabs={tabs} activeId={activeTab.id} onSelect={setActiveId} onClose={closeTab} onAdd={addTab} />

        {databaseConfigured ? (
          <div className="border-b border-success/20 bg-success/5 px-3 py-2 text-xs text-success">
            Live PostgreSQL execution{!canRunSql && " is unavailable to your role."}
          </div>
        ) : (
          <div className="border-b border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
            Demo mode — results are simulated from sample data and do not execute against PostgreSQL.
          </div>
        )}
        {queryWarning && <p role="status" className="border-b border-warning/20 px-3 py-2 text-xs text-warning">{queryWarning}</p>}
        {metadataError && <p role="status" className="border-b border-warning/20 px-3 py-2 text-xs text-warning">Autocomplete unavailable: {metadataError}</p>}
        {metadataTruncated && <p role="status" className="border-b border-warning/20 px-3 py-2 text-xs text-warning">Autocomplete metadata reached its 5,000-column limit; suggestions may be incomplete.</p>}

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <Button size="sm" onClick={() => { setRunMode("statement"); void handleRun("statement"); }} disabled={isLoading || (databaseConfigured && !canRunSql)} title="Execute as a single PostgreSQL statement (existing behavior)">
            {isLoading && runMode === "statement" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run statement
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setRunMode("script"); void handleRun("script"); }} disabled={isLoading || (databaseConfigured && !canRunSql)} title="Execute as a multi-statement migration script (DDL, DO blocks, indexes)">
            {isLoading && runMode === "script" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
            Run script
          </Button>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-muted" title="transaction: all statements in one atomic transaction (default). autocommit: each statement commits on its own; required for VACUUM / CONCURRENTLY / CREATE DATABASE.">
            <input
              type="checkbox"
              checked={transactionMode === "autocommit"}
              onChange={(event) => setTransactionMode(event.target.checked ? "autocommit" : "transaction")}
              className="h-3.5 w-3.5 accent-current"
            />
            Autocommit mode
          </label>
          <Button size="sm" variant="secondary" onClick={() => { setSaveError(null); setSaveModalOpen(true); }}>
            <Bookmark className="h-3.5 w-3.5" />
            Save
          </Button>
          <span className="ml-auto text-[11px] text-ink-faint">⌘/Ctrl + Enter runs a single statement</span>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-border">
          <SqlEditor
            value={activeTab.sql}
            onChange={(sql) => updateSql(activeTab.id, sql)}
            onRun={() => void handleRun()}
            identifiers={identifiers}
            errorOffset={errorLocation}
            focusErrorToken={focusErrorToken}
          />
          <QueryResults
            outcome={activeOutcome}
            loading={isLoading}
            onGoToError={() => setFocusErrorToken((token) => token + 1)}
          />
        </div>
      </div>

      <Modal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Save query"
        description="Saved SQL is private to your signed-in account."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={savingQuery || !saveName.trim() || !activeTab.sql.trim()}>
              {savingQuery && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </>
        }
      >
        <Input value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="e.g. Active users" autoFocus />
        {saveError && <p role="alert" className="mt-2 text-xs text-danger">{saveError}</p>}
      </Modal>
    </div>
  );
}
