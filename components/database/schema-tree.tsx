"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search, Table2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { tables, type TableInfo } from "@/lib/mock-data";

export function SchemaTree({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tables.filter((t) => t.name.toLowerCase().includes(q)) : tables;
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, TableInfo[]>();
    for (const t of filtered) {
      if (!map.has(t.schema)) map.set(t.schema, []);
      map.get(t.schema)!.push(t);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggleSchema(schema: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(schema)) next.delete(schema);
      else next.add(schema);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Input
          icon={<Search className="h-3.5 w-3.5" />}
          placeholder="Filter tables…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {grouped.length === 0 && (
          <p className="px-2.5 py-6 text-center text-sm text-ink-faint">No tables match &ldquo;{query}&rdquo;.</p>
        )}
        {grouped.map(([schema, schemaTables]) => {
          const isCollapsed = collapsed.has(schema);
          return (
            <div key={schema} className="mb-1">
              <button
                onClick={() => toggleSchema(schema)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-ink-faint hover:text-ink-muted"
              >
                <ChevronRight className={cn("h-3 w-3 transition-transform duration-150", !isCollapsed && "rotate-90")} />
                {schema}
                <span className="ml-auto font-mono text-[10px] text-ink-faint">{schemaTables.length}</span>
              </button>

              {!isCollapsed &&
                schemaTables.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => onSelect(t.name)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-left text-sm transition-colors duration-100",
                      selected === t.name
                        ? "bg-accent-soft text-ink"
                        : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                    )}
                  >
                    <Table2 className={cn("h-3.5 w-3.5 shrink-0", selected === t.name ? "text-accent" : "text-ink-faint")} />
                    <span className="truncate font-mono text-[13px]">{t.name}</span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
