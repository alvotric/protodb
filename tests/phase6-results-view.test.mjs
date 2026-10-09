import test from "node:test";
import assert from "node:assert/strict";
import { resolveResultsView } from "../lib/queries/results-view.ts";

const singleSuccess = (overrides = {}) => ({
  ok: true,
  columns: ["id", "email"],
  rows: [{ id: 1, email: "a@example.test" }],
  rowCount: 1,
  durationMs: 12,
  truncated: false,
  ...overrides,
});

const scriptSuccess = (overrides = {}) => ({
  ok: true,
  kind: "script",
  totalStatements: 2,
  executedStatements: 2,
  transactionMode: "transaction",
  results: [
    { index: 1, preview: "create table t …", command: "CREATE", rowCount: null, durationMs: 3 },
    { index: 2, preview: "insert into t …", command: "INSERT", rowCount: 3, durationMs: 4 },
  ],
  durationMs: 9,
  ...overrides,
});

test("loading takes precedence over any outcome", () => {
  assert.equal(resolveResultsView(singleSuccess(), true), "loading");
  assert.equal(resolveResultsView({ ok: false, message: "boom", durationMs: 1 }, true), "loading");
  assert.equal(resolveResultsView(null, true), "loading");
});

test("no outcome renders the empty state", () => {
  assert.equal(resolveResultsView(null, false), "empty");
});

test("failed outcomes render the error state, including script failures with partial results", () => {
  assert.equal(resolveResultsView({ ok: false, message: "boom", durationMs: 1 }, false), "error");
  assert.equal(
    resolveResultsView(
      {
        ok: false,
        kind: "script",
        totalStatements: 3,
        executedStatements: 1,
        failedStatement: 2,
        message: "boom",
        transactionMode: "transaction",
        results: [{ index: 1, preview: "select 1", command: "SELECT", rowCount: 1, durationMs: 2 }],
        durationMs: 5,
      },
      false
    ),
    "error"
  );
});

test("successful script outcomes render the script state", () => {
  assert.equal(resolveResultsView(scriptSuccess(), false), "script");
  assert.equal(resolveResultsView(scriptSuccess({ transactionMode: "autocommit" }), false), "script");
});

test("successful single-statement outcomes render the single state", () => {
  assert.equal(resolveResultsView(singleSuccess(), false), "single");
  assert.equal(resolveResultsView(singleSuccess({ rows: [], rowCount: 0 }), false), "single");
  assert.equal(resolveResultsView(singleSuccess({ truncated: true }), false), "single");
  assert.equal(resolveResultsView(singleSuccess({ columns: [] }), false), "single");
});

test("result source (live vs demo) and non-script kinds do not change the view", () => {
  assert.equal(resolveResultsView({ ...singleSuccess(), source: "live" }, false), "single");
  assert.equal(resolveResultsView({ ...singleSuccess(), source: "demo" }, false), "single");
  assert.equal(resolveResultsView({ ...scriptSuccess(), source: "live" }, false), "script");
  assert.equal(resolveResultsView(singleSuccess({ kind: "other" }), false), "single");
});
