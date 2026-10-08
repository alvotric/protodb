/**
 * PostgreSQL-aware multi-statement splitter for the ProtoDB SQL Editor.
 *
 * Splits a script into individual statements WITHOUT executing anything.
 * Correctly ignores semicolons inside:
 * - single-quoted strings ('...', E'...' with '' and backslash escapes)
 * - double-quoted identifiers ("...")
 * - line comments (-- ...)
 * - block comments (slash-star ... star-slash, nested)
 * - dollar-quoted blocks ($$ ... $$, $tag$ ... $tag$)
 *
 * Never uses naive `sql.split(";")`.
 */

export interface SplitStatement {
  /** 1-based statement number within the script. */
  index: number;
  /** Statement text including its terminating semicolon (when present). */
  text: string;
  /** Offset of the first non-whitespace/comment character in the original script. */
  start: number;
  /** Offset one past the statement terminator in the original script. */
  end: number;
  /** Short single-line preview for error messages / UI. */
  preview: string;
}

export const MAX_SCRIPT_STATEMENTS = 200;
export const SCRIPT_PREVIEW_LENGTH = 160;

export function statementPreview(text: string, maxLength = SCRIPT_PREVIEW_LENGTH): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength - 1)}…`;
}

function isEmptyStatementBody(text: string): boolean {
  return text.replace(/^\s+|\s+$/g, "").length === 0;
}

function isDollarTagStart(char: string): boolean {
  return char === "$";
}

/** Try to read a dollar-quote opening tag like $$ or $body$ at offset. Returns tag or null. */
function readDollarTag(sql: string, offset: number): string | null {
  if (sql[offset] !== "$") return null;
  let end = offset + 1;
  while (end < sql.length && sql[end] !== "$") {
    const ch = sql[end];
    if (!/[A-Za-z0-9_]/.test(ch)) return null;
    end++;
  }
  if (end >= sql.length || sql[end] !== "$") return null;
  const tag = sql.slice(offset, end + 1);
  const inner = tag.slice(1, -1);
  // Bare $$ is always valid; otherwise the tag must follow unquoted identifier rules.
  if (inner.length > 0 && !/^[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF$]*$/.test(inner)) return null;
  return tag;
}

export function splitPostgresScript(sql: string): SplitStatement[] {
  const statements: SplitStatement[] = [];
  const length = sql.length;
  let currentStart = 0; // start of the current raw chunk (including leading trivia)
  let bodyStart = -1; // first significant char of the current statement
  let i = 0;

  let inSingleQuote = false;
  let singleEscapePrefix = false; // E'...' string: backslash escapes apply
  let inDoubleQuote = false;
  let inLineComment = false;
  let blockCommentDepth = 0;

  const markBody = (offset: number) => {
    if (bodyStart === -1) bodyStart = offset;
  };

  const flush = (endExclusive: number, terminatorConsumed: boolean) => {
    const raw = sql.slice(currentStart, terminatorConsumed ? endExclusive : endExclusive);
    if (bodyStart === -1 || isEmptyStatementBody(raw)) {
      currentStart = endExclusive;
      bodyStart = -1;
      return;
    }
    const text = raw.trim();
    const index = statements.length + 1;
    statements.push({
      index,
      text,
      start: bodyStart,
      end: endExclusive,
      preview: statementPreview(text),
    });
    currentStart = endExclusive;
    bodyStart = -1;
  };

  while (i < length) {
    const ch = sql[i];
    const next = i + 1 < length ? sql[i + 1] : "";

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }

    if (blockCommentDepth > 0) {
      if (ch === "/" && next === "*") {
        blockCommentDepth++;
        i += 2;
        continue;
      }
      if (ch === "*" && next === "/") {
        blockCommentDepth--;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (inSingleQuote) {
      markBody(currentStart === i ? i : bodyStart === -1 ? i : bodyStart);
      if (ch === "'") {
        if (next === "'") {
          i += 2; // '' escape stays inside the string
          continue;
        }
        inSingleQuote = false;
        singleEscapePrefix = false;
        i++;
        continue;
      }
      if (singleEscapePrefix && ch === "\\" && next.length > 0) {
        i += 2; // E'...\' escape
        continue;
      }
      i++;
      continue;
    }

    if (inDoubleQuote) {
      if (ch === '"') {
        if (next === '"') {
          i += 2;
          continue;
        }
        inDoubleQuote = false;
        i++;
        continue;
      }
      i++;
      continue;
    }

    // Not inside any string/comment/dollar block.
    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockCommentDepth = 1;
      i += 2;
      continue;
    }
    if (ch === '"') {
      markBody(i);
      inDoubleQuote = true;
      i++;
      continue;
    }
    if (ch === "'") {
      markBody(i);
      // Detect E'...' / e'...' prefix: an E immediately before the quote that
      // is itself not part of a larger identifier.
      const prev = i > 0 ? sql[i - 1] : "";
      const eIsPrefix =
        (prev === "E" || prev === "e") &&
        (i - 1 === 0 || !/[A-Za-z0-9_$]/.test(sql[i - 2] ?? ""));
      singleEscapePrefix = eIsPrefix;
      inSingleQuote = true;
      i++;
      continue;
    }
    if (isDollarTagStart(ch)) {
      const tag = readDollarTag(sql, i);
      if (tag !== null) {
        markBody(i);
        i += tag.length;
        // Consume through the matching close tag; nothing inside a
        // dollar-quoted block (not even semicolons or quotes) splits.
        const closeIndex = sql.indexOf(tag, i);
        if (closeIndex === -1) {
          // Unterminated dollar block: consume to end; the statement will be
          // whatever remains (PostgreSQL will report the syntax error).
          i = length;
          continue;
        }
        i = closeIndex + tag.length;
        continue;
      }
      markBody(i);
      i++;
      continue;
    }
    if (ch === ";") {
      i++;
      flush(i, true);
      continue;
    }
    if (!/\s/.test(ch)) markBody(i);
    i++;
  }

  flush(length, false);
  return statements;
}

/**
 * Statements PostgreSQL refuses to run inside a transaction block.
 * If any of these appear in a script, the whole-script single-transaction
 * strategy is unsafe; the caller must use autocommit (per-statement) mode.
 */
const NON_TRANSACTIONAL_PATTERN =
  /^\s*(vacuum(\s|;|$)|cluster(\s|;|$)|create\s+database\b|drop\s+database\b|create\s+tablespace\b|drop\s+tablespace\b|alter\s+system\b|discard\b|create\s+index\s+concurrently\b|drop\s+index\s+concurrently\b|reindex\b[^;]*\bconcurrently\b)/i;

export function isNonTransactionalStatement(statementText: string): boolean {
  const withoutComments = statementText
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  return NON_TRANSACTIONAL_PATTERN.test(withoutComments.trim());
}

export function findNonTransactionalStatements(statements: SplitStatement[]): SplitStatement[] {
  return statements.filter((statement) => isNonTransactionalStatement(statement.text));
}
