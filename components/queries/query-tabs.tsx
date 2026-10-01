"use client";

import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QueryTab {
  id: string;
  name: string;
  sql: string;
}

export function QueryTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
}: {
  tabs: QueryTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border bg-surface/60 px-2 pt-1.5">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "group flex items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-sm transition-colors",
              active
                ? "border-border bg-canvas text-ink"
                : "border-transparent text-ink-faint hover:text-ink-muted"
            )}
          >
            {tab.name}
            {tabs.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                aria-label={`Close ${tab.name}`}
                className="flex h-4 w-4 items-center justify-center rounded opacity-0 hover:bg-surface-hover group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
      <button
        onClick={onAdd}
        aria-label="New query tab"
        className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-hover hover:text-ink"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
