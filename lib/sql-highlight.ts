export type SqlTokenType = "keyword" | "string" | "comment" | "number" | "identifier" | "punctuation" | "whitespace";

export interface SqlToken {
  text: string;
  type: SqlTokenType;
}

const KEYWORDS = new Set([
  "select", "from", "where", "insert", "into", "values", "update", "set", "delete",
  "create", "table", "alter", "drop", "join", "inner", "left", "right", "outer", "on",
  "and", "or", "not", "null", "is", "as", "order", "by", "group", "having", "limit",
  "offset", "asc", "desc", "distinct", "count", "sum", "avg", "min", "max", "in", "like",
  "between", "exists", "union", "all", "default", "primary", "key", "foreign", "references",
  "unique", "check", "constraint", "cascade", "if", "begin", "commit", "rollback", "returning",
]);

/**
 * Phase 6 — Advanced SQL Editor & Results.
 *
 * Every character of the input maps to exactly one token, in order,
 * with nothing dropped or reordered -- required since this backs an
 * overlay highlight layer that has to render pixel-identical text to
 * the real `<textarea>` sitting on top of it (see sql-editor.tsx).
 * Deliberately not a real SQL parser; a handful of regex alternations
 * covering strings/comments/numbers/words/whitespace/punctuation is
 * enough for editor-grade coloring, not query validation.
 */
export function tokenizeSQL(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const pattern = /('(?:[^']|'')*'?)|(--[^\n]*)|(\d+\.?\d*)|([a-zA-Z_][a-zA-Z0-9_]*)|(\s+)|([^\sa-zA-Z0-9_])/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    const [full, str, comment, num, word, ws] = match;
    if (str !== undefined) tokens.push({ text: full, type: "string" });
    else if (comment !== undefined) tokens.push({ text: full, type: "comment" });
    else if (num !== undefined) tokens.push({ text: full, type: "number" });
    else if (word !== undefined) tokens.push({ text: full, type: KEYWORDS.has(word.toLowerCase()) ? "keyword" : "identifier" });
    else if (ws !== undefined) tokens.push({ text: full, type: "whitespace" });
    else tokens.push({ text: full, type: "punctuation" });
  }
  return tokens;
}
