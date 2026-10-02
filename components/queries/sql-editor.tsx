"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Sparkles } from "lucide-react";
import { tokenizeSQL, type SqlTokenType } from "@/lib/sql-highlight";

/**
 * Phase 6 — Advanced SQL Editor & Results.
 *
 * A highlighted `<textarea>` without a dependency: a transparent,
 * fully-functional native textarea sits on top of a `<pre>` rendering
 * the same text as colored spans underneath it (text-transparent +
 * caret-color keeps the real caret visible while the overlay supplies
 * the color). Both share identical font/padding/line-height/wrapping
 * so they stay pixel-aligned, and the textarea's `onScroll` mirrors
 * its scroll position onto the overlay.
 *
 * Autocomplete is deliberately not caret-positioned (that needs a
 * hidden mirror-div to measure exact caret pixel coordinates -- real,
 * but intricate and risky to get right without a live browser to
 * test against). Instead it's a suggestion strip below the editor:
 * lower-risk, still genuinely useful, Tab inserts the first match.
 */
const TOKEN_CLASSES: Record<SqlTokenType, string> = {
  keyword: "text-accent",
  string: "text-success",
  comment: "text-ink-faint italic",
  number: "text-warning",
  identifier: "text-ink",
  punctuation: "text-ink-muted",
  whitespace: "",
};

function currentWord(value: string, cursor: number): { word: string; start: number } {
  let start = cursor;
  while (start > 0 && /[a-zA-Z0-9_]/.test(value[start - 1])) start--;
  if (start > 0 && value[start - 1] === '"') start--;
  return { word: value.slice(value[start] === '"' ? start + 1 : start, cursor), start };
}

function suggestionParts(identifier: string): { finalPart: string; finalSqlPart: string; qualified: boolean } {
  let quoted = false;
  let componentStart = 0;
  let qualified = false;
  for (let index = 0; index < identifier.length; index++) {
    if (identifier[index] === '"') {
      if (quoted && identifier[index + 1] === '"') {
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (identifier[index] === "." && !quoted) {
      componentStart = index + 1;
      qualified = true;
    }
  }
  const finalSqlPart = identifier.slice(componentStart);
  const finalPart = finalSqlPart.replace(/^"|"$/g, "").replace(/""/g, '"');
  return { finalPart, finalSqlPart, qualified };
}

export function SqlEditor({
  value,
  onChange,
  onRun,
  identifiers,
  errorOffset,
  focusErrorToken,
}: {
  value: string;
  onChange: (next: string) => void;
  onRun: () => void;
  identifiers: string[];
  errorOffset: number | null;
  focusErrorToken: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLPreElement>(null);
  const [cursor, setCursor] = useState(0);

  const tokens = useMemo(() => tokenizeSQL(value), [value]);

  const { word, start } = currentWord(value, cursor);
  const suggestions = useMemo(() => {
    if (word.length < 2) return [];
    const lower = word.toLowerCase();
    return identifiers.filter((id) => {
      const match = suggestionParts(id).finalPart.toLowerCase();
      return match.startsWith(lower) && match !== lower;
    }).slice(0, 8);
  }, [identifiers, word]);

  useEffect(() => {
    if (focusErrorToken === 0 || errorOffset === null) return;
    const editor = textareaRef.current;
    if (!editor) return;
    const offset = Math.max(0, Math.min(errorOffset, value.length));
    editor.focus();
    editor.setSelectionRange(offset, Math.min(value.length, offset + 1));
    const lineHeight = 24;
    const line = value.slice(0, offset).split("\n").length - 1;
    editor.scrollTop = Math.max(0, line * lineHeight - editor.clientHeight / 2);
    setCursor(offset);
  }, [errorOffset, focusErrorToken, value]);

  function insertSuggestion(suggestion: string) {
    const parts = suggestionParts(suggestion);
    const existingQualifier = value.slice(0, start).trimEnd().endsWith(".");
    const insertion = parts.qualified && existingQualifier
      ? parts.finalSqlPart
      : suggestion;
    const next = value.slice(0, start) + insertion + value.slice(cursor);
    onChange(next);
    const nextCursor = start + insertion.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      setCursor(nextCursor);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onRun();
      return;
    }
    if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      insertSuggestion(suggestions[0]);
    }
  }

  function syncCursor() {
    if (textareaRef.current) setCursor(textareaRef.current.selectionStart);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        <pre
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-6"
        >
          {tokens.map((t, i) => (
            <span key={i} className={TOKEN_CLASSES[t.type]}>
              {t.text}
            </span>
          ))}
        </pre>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCursor(e.target.selectionStart);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={syncCursor}
          onClick={syncCursor}
          onScroll={(e) => {
            if (overlayRef.current) {
              overlayRef.current.scrollTop = e.currentTarget.scrollTop;
              overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          spellCheck={false}
          placeholder="select * from users limit 10;"
          className="absolute inset-0 resize-none overflow-auto whitespace-pre-wrap break-words bg-transparent p-4 font-mono text-[13px] leading-6 text-transparent caret-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface px-3 py-2">
          <Sparkles className="h-3 w-3 shrink-0 text-ink-faint" />
          {suggestions.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSuggestion(s)}
              className="rounded-md border border-border bg-surface-hover px-2 py-0.5 font-mono text-xs text-ink-muted hover:border-accent-line hover:text-ink"
            >
              {s}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-ink-faint">Tab to insert</span>
        </div>
      )}
    </div>
  );
}
