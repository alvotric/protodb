"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, Bookmark, Trash2 } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { QueryHistoryRecord } from "@/lib/queries/types";

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  createdAt?: string;
}

const statusIcon = { success: CheckCircle2, error: XCircle, running: Loader2 } as const;
const statusClass = { success: "text-success", error: "text-danger", running: "text-accent animate-spin" } as const;

export function QueryHistoryPanel({
  history,
  saved,
  onLoad,
  onRemoveSaved,
  historyLoading,
  historyError,
  savedLoading,
  savedError,
  busySavedId,
  onRetry,
}: {
  history: QueryHistoryRecord[];
  saved: SavedQuery[];
  onLoad: (sql: string) => void;
  onRemoveSaved: (id: string) => void;
  historyLoading: boolean;
  historyError: string | null;
  savedLoading: boolean;
  savedError: string | null;
  busySavedId: string | null;
  onRetry: () => void;
}) {
  const [tab, setTab] = useState<"history" | "saved">("history");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-2">
        <Tabs
          items={[
            { value: "history", label: "History", count: history.length },
            { value: "saved", label: "Saved", count: saved.length },
          ]}
          value={tab}
          onChange={(v) => setTab(v as "history" | "saved")}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tab === "history" &&
          (historyLoading ? (
            <p className="px-2.5 py-6 text-center text-xs text-ink-faint">Loading query history…</p>
          ) : historyError ? (
            <div className="px-2.5 py-6 text-center">
              <p className="text-xs text-danger">{historyError}</p>
              <button onClick={onRetry} className="mt-2 text-xs text-accent hover:underline">Retry</button>
            </div>
          ) : history.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-xs text-ink-faint">No queries executed yet.</p>
          ) : (
            history.map((item) => {
              const Icon = statusIcon[item.status];
              return (
                <button
                  key={item.id}
                  onClick={() => onLoad(item.sql)}
                  className="mb-1 flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn("h-3 w-3 shrink-0", statusClass[item.status])} />
                    <span className="truncate font-mono text-[12px] text-ink">{item.sql}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-[18px] text-[11px] text-ink-faint">
                    <span>{timeAgo(item.ranAt)}</span>
                    {item.rows !== null && <span>· {item.rows} rows</span>}
                    <span>· {item.durationMs}ms</span>
                  </div>
                  {item.error && <p className="truncate pl-[18px] text-[11px] text-danger">{item.error}</p>}
                </button>
              );
            })
          ))}

        {tab === "saved" &&
          (savedLoading ? (
            <p className="px-2.5 py-6 text-center text-xs text-ink-faint">Loading saved queries…</p>
          ) : savedError ? (
            <div className="px-2.5 py-6 text-center">
              <p className="text-xs text-danger">{savedError}</p>
              <button onClick={onRetry} className="mt-2 text-xs text-accent hover:underline">Retry</button>
            </div>
          ) : saved.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-xs text-ink-faint">No saved queries yet.</p>
          ) : (
            saved.map((item) => (
              <div key={item.id} className="group mb-1 flex items-center gap-1 rounded-lg hover:bg-surface-hover">
                <button onClick={() => onLoad(item.sql)} className="flex-1 truncate px-2.5 py-2 text-left">
                  <span className="flex items-center gap-1.5 text-sm text-ink">
                    <Bookmark className="h-3 w-3 shrink-0 text-accent" />
                    {item.name}
                  </span>
                  <span className="mt-0.5 block truncate pl-[18px] font-mono text-[11px] text-ink-faint">{item.sql}</span>
                </button>
                <button
                  onClick={() => onRemoveSaved(item.id)}
                  disabled={busySavedId === item.id}
                  aria-label={`Remove ${item.name}`}
                  className="mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint opacity-0 hover:bg-danger-soft hover:text-danger group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
