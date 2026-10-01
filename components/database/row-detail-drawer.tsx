"use client";

import { useState, useEffect } from "react";
import { KeyRound, Link2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { TableColumn, TableRowData, CellValue } from "@/lib/mock-data";

export function RowDetailDrawer({
  open,
  onClose,
  tableName,
  columns,
  row,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  tableName: string;
  columns: TableColumn[];
  row: TableRowData | null;
  onSave: (next: TableRowData) => void;
}) {
  const [draft, setDraft] = useState<TableRowData | null>(row);

  useEffect(() => setDraft(row), [row]);

  if (!draft) return null;

  function setField(name: string, value: CellValue) {
    setDraft((prev) => (prev ? { ...prev, [name]: value } : prev));
  }

  return (
    <Drawer open={open} onClose={onClose} title={`Row detail`} description={`${tableName} · every column, one place`}>
      <div className="space-y-4">
        {columns.map((col) => {
          const value = draft[col.name];
          const locked = Boolean(col.isPrimaryKey);
          return (
            <div key={col.name}>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                {col.isPrimaryKey && <KeyRound className="h-3 w-3 text-accent" />}
                {col.isForeignKey && <Link2 className="h-3 w-3 text-ink-faint" />}
                <span className="font-mono">{col.name}</span>
                <span className="text-ink-faint">· {col.type}</span>
              </label>

              {col.type === "boolean" ? (
                <Switch
                  checked={Boolean(value)}
                  onChange={(v) => setField(col.name, v)}
                  aria-label={col.name}
                />
              ) : (
                <Input
                  mono
                  disabled={locked}
                  value={value === null ? "" : String(value)}
                  placeholder={value === null ? "NULL" : undefined}
                  onChange={(e) => setField(col.name, e.target.value)}
                />
              )}
              {col.nullable && !locked && (
                <button
                  onClick={() => setField(col.name, value === null ? "" : null)}
                  className="mt-1 text-[11px] text-ink-faint hover:text-accent"
                >
                  {value === null ? "Set a value" : "Set to NULL"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (draft) onSave(draft);
            onClose();
          }}
        >
          Save row
        </Button>
      </div>
    </Drawer>
  );
}
