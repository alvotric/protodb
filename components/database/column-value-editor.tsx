"use client";

import type { RealColumn } from "@/lib/database/schema-service";
import type { KeyboardEvent, ReactNode } from "react";

function editorType(columnType: string): "text" | "number" | "date" | "time" {
  const type = columnType.toLowerCase();
  if (["smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision"].includes(type)) return "number";
  if (type === "date") return "date";
  if (type === "time without time zone") return "time";
  return "text";
}

function inputValue(value: unknown, type: ReturnType<typeof editorType>): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (type === "date") return text.slice(0, 10);
  if (type === "time") return text.slice(0, 8);
  return text;
}

export function ColumnValueEditor({
  column,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  onKeyDown,
}: {
  column: Pick<RealColumn, "name" | "type" | "nullable">;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
}) {
  const normalizedType = column.type.toLowerCase();
  const controlClass =
    "h-8 w-full rounded-md border border-border bg-canvas px-2 font-mono text-[13px] text-ink focus:border-accent-line focus:outline-none disabled:opacity-50";

  function handleBooleanChange(selected: string) {
    if (selected === "") {
      onChange(value === null ? null : undefined);
      return;
    }
    onChange(selected === "true");
  }

  function toggleNull() {
    if (value !== null) {
      onChange(null);
    } else {
      onChange(normalizedType === "boolean" ? false : "");
    }
  }

  let control: ReactNode;
  if (normalizedType === "boolean") {
    control = (
      <select
        aria-label={column.name}
        className={controlClass}
        disabled={disabled || value === null}
        value={value === null || value === undefined || value === "" ? "" : String(Boolean(value))}
        onChange={(event) => handleBooleanChange(event.target.value)}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      >
        {(value === null || value === undefined || value === "") && (
          <option value="" disabled={value === null}>{value === null ? "NULL" : "Default"}</option>
        )}
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else if (normalizedType === "json" || normalizedType === "jsonb") {
    control = (
      <textarea
        aria-label={column.name}
        className="min-h-20 w-full rounded-md border border-border bg-canvas px-2 py-1.5 font-mono text-[13px] text-ink focus:border-accent-line focus:outline-none disabled:opacity-50"
        disabled={disabled || value === null}
        value={inputValue(value, "text")}
        onChange={(event) => onChange(event.target.value)}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
    );
  } else {
    const type = editorType(column.type);
    control = (
      <input
        aria-label={column.name}
        type={type}
        step={type === "number" ? "any" : undefined}
        placeholder={
          column.type.toLowerCase().startsWith("timestamp ")
            ? "ISO date-time"
            : column.type.toLowerCase() === "time with time zone"
              ? "HH:MM:SS with timezone"
              : undefined
        }
        className={controlClass}
        disabled={disabled || value === null}
        value={inputValue(value, type)}
        onChange={(event) => onChange(event.target.value)}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <div className="space-y-1">
      {control}
      {column.nullable && (
        <button
          type="button"
          disabled={disabled}
          onClick={toggleNull}
          className="text-[11px] text-ink-faint hover:text-accent disabled:opacity-50"
        >
          {value === null ? "Set a value" : "Set to NULL"}
        </button>
      )}
    </div>
  );
}
