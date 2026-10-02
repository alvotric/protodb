import test from "node:test";
import assert from "node:assert/strict";
import { canExecuteSql } from "../lib/auth/authorization.ts";
import {
  MAX_RESULT_BYTES,
  MAX_RESULT_ROWS,
  MAX_SQL_BYTES,
  QUERY_CONCURRENCY_LIMIT,
  QUERY_HISTORY_LIMIT,
  SQL_STATEMENT_TIMEOUT_MS,
  acquireQuerySlot,
  parseSavedQueryId,
  parseSavedQueryPayload,
  positionToLocation,
  safePostgresError,
  validateSqlText,
} from "../lib/queries/query-policy.ts";
import {
  queryHistoryListStatement,
  savedQueryDeleteStatement,
  savedQueryListStatement,
} from "../lib/queries/persistence-queries.ts";
import { toCsv, toJson } from "../lib/queries/export.ts";
import { parseMockQueryTail } from "../lib/queries/mock-query-shape.ts";
import { appendBoundedRows } from "../lib/queries/result-limits.ts";

test("SQL envelope enforces text, byte, and saved-query limits", () => {
  assert.equal(validateSqlText("select 1"), "select 1");
  assert.throws(() => validateSqlText("  "), /non-empty/);
  assert.throws(() => validateSqlText("é".repeat(Math.floor(MAX_SQL_BYTES / 2) + 1)), /bytes/);
  assert.equal(parseSavedQueryPayload({ name: " My query ", sql: "select 1" }).name, "My query");
  assert.throws(() => parseSavedQueryPayload({ name: "query", sql: "select 1", user_id: "victim" }), /Only the name and sql/);
  assert.throws(() => parseSavedQueryId("not-a-uuid"), /ID is invalid/);
});

test("SQL execution authorization is Owner/Admin only", () => {
  const user = (role) => ({ id: "u1", email: "user@example.test", name: "User", role, status: "active" });
  assert.equal(canExecuteSql(user("Owner")), true);
  assert.equal(canExecuteSql(user("Admin")), true);
  assert.equal(canExecuteSql(user("Editor")), false);
  assert.equal(canExecuteSql(user("Viewer")), false);
});

test("query policy bounds execution time, result size, rows, history, and concurrency", () => {
  assert.equal(SQL_STATEMENT_TIMEOUT_MS, 10_000);
  assert.equal(MAX_RESULT_ROWS, 500);
  assert.equal(MAX_RESULT_BYTES, 1_000_000);
  assert.equal(QUERY_HISTORY_LIMIT, 100);
  const releases = Array.from({ length: QUERY_CONCURRENCY_LIMIT }, () => acquireQuerySlot());
  assert.ok(releases.every(Boolean));
  assert.equal(acquireQuerySlot(), null);
  for (const release of releases) release();
  const finalRelease = acquireQuerySlot();
  assert.ok(finalRelease);
  finalRelease();
});

test("PostgreSQL character positions map to one-based line and column", () => {
  assert.deepEqual(positionToLocation("select 1;\nselect 2", "11"), {
    position: 11,
    offset: 10,
    line: 2,
    column: 1,
  });
  assert.deepEqual(positionToLocation("a😀b", 3), {
    position: 3,
    offset: 3,
    line: 1,
    column: 3,
  });
  assert.equal(positionToLocation("select 1", 0), null);
  assert.equal(positionToLocation("select 1", undefined), null);
});

test("database errors expose safe messages and omit internal detail", () => {
  const error = safePostgresError({
    code: "42601",
    position: "8",
    message: "syntax error near password=secret",
    detail: "internal server details",
  });
  assert.deepEqual(error, { message: "PostgreSQL could not parse the SQL statement.", code: "42601", position: 8 });
  assert.equal(safePostgresError({ code: "57014" }).message.startsWith("The query exceeded"), true);
});

test("result rows are capped by both row count and serialized output bytes", () => {
  const rowLimited = appendBoundedRows(
    ["id"],
    [],
    0,
    [[1], [2], [3]],
    2,
    MAX_RESULT_BYTES
  );
  assert.deepEqual(rowLimited.rows, [{ id: 1 }, { id: 2 }]);
  assert.equal(rowLimited.truncated, true);

  const byteLimited = appendBoundedRows(["value"], [], 0, [["x".repeat(20)]], 10, 10);
  assert.deepEqual(byteLimited.rows, []);
  assert.equal(byteLimited.truncated, true);
});

test("CSV handles delimiters, quotes, CR/LF, explicit NULL and spreadsheet formulas", () => {
  const csv = toCsv(["normal", "formula"], [
    { normal: null, formula: "=SUM(A1:A2)" },
    { normal: 'comma,"quote"\r\n雪', formula: " -1+2" },
  ]);
  assert.equal(csv, "normal,formula\r\n\\N,'=SUM(A1:A2)\r\n\"comma,\"\"quote\"\"\r\n雪\",' -1+2");
});

test("JSON export preserves null and actual structured values", () => {
  const json = toJson([{ nullable: null, count: "9007199254740993", document: { ok: true } }]);
  assert.deepEqual(JSON.parse(json), [{
    nullable: null,
    count: "9007199254740993",
    document: { ok: true },
  }]);
});

test("history and saved-query statements are scoped to the authenticated owner", () => {
  const history = queryHistoryListStatement("session-user", QUERY_HISTORY_LIMIT);
  const saved = savedQueryListStatement("session-user");
  const remove = savedQueryDeleteStatement("saved-id", "session-user");
  assert.match(history.text, /where user_id = \$1/);
  assert.deepEqual(history.values, ["session-user", QUERY_HISTORY_LIMIT]);
  assert.match(saved.text, /where user_id = \$1/);
  assert.deepEqual(saved.values, ["session-user"]);
  assert.match(remove.text, /id = \$1 and user_id = \$2/);
  assert.deepEqual(remove.values, ["saved-id", "session-user"]);
});

test("mock mode rejects unsupported predicates instead of returning misleading success", () => {
  assert.deepEqual(parseMockQueryTail(" where id = 1 limit 2"), {
    whereColumn: "id",
    whereStringValue: null,
    whereNumberValue: "1",
    limit: "2",
  });
  assert.equal(parseMockQueryTail(" where in_stock = true"), null);
  assert.equal(parseMockQueryTail(" where id = 1 or true"), null);
});
