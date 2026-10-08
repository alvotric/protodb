import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_SCRIPT_STATEMENTS,
  findNonTransactionalStatements,
  isNonTransactionalStatement,
  splitPostgresScript,
  statementPreview,
} from "../lib/queries/script-splitter.ts";
import { executeScript, parseScriptTransactionMode } from "../lib/queries/script-service.ts";
import { isQueryOutcome, isScriptOutcome } from "../lib/queries/types.ts";
import { validateSqlText } from "../lib/queries/query-policy.ts";

test("splits a simple two-statement script", () => {
  const parts = splitPostgresScript("select 1; select 2;");
  assert.equal(parts.length, 2);
  assert.equal(parts[0].index, 1);
  assert.equal(parts[1].index, 2);
  assert.match(parts[0].text, /select 1/);
  assert.match(parts[1].text, /select 2/);
});

test("ignores semicolons inside single-quoted strings", () => {
  const parts = splitPostgresScript("insert into t (v) values ('a;b'); select 1;");
  assert.equal(parts.length, 2);
  assert.match(parts[0].text, /'a;b'/);
});

test("ignores semicolons inside double-quoted identifiers", () => {
  const parts = splitPostgresScript('select "we;ird" from t; select 2;');
  assert.equal(parts.length, 2);
});

test("ignores semicolons inside line and block comments", () => {
  const parts = splitPostgresScript("-- comment ; with semicolon\nselect 1; /* block ; comment */ select 2;");
  assert.equal(parts.length, 2);
  assert.match(parts[0].text, /select 1/);
});

test("keeps DO $$ ... $$ blocks as one statement", () => {
  const sql = `do $$
begin
  raise notice 'hello; world';
end $$;
select 1;`;
  const parts = splitPostgresScript(sql);
  assert.equal(parts.length, 2);
  assert.match(parts[0].text, /raise notice/);
});

test("keeps tagged dollar quotes ($tag$ ... $tag$) as one statement", () => {
  const sql = `create function f() returns void as $body$ begin raise notice 'x;y'; end; $body$ language plpgsql; select 1;`;
  const parts = splitPostgresScript(sql);
  assert.equal(parts.length, 2);
});

test("handles multiline migration-style DDL", () => {
  const sql = `create table if not exists chats (
  id uuid primary key,
  title text not null default 'New chat'
);
create index if not exists idx on chats(title);`;
  const parts = splitPostgresScript(sql);
  assert.equal(parts.length, 2);
});

test("single statement remains a single statement (backward compatibility)", () => {
  const parts = splitPostgresScript("select 1;");
  assert.equal(parts.length, 1);
  const bare = splitPostgresScript("select 1");
  assert.equal(bare.length, 1);
  assert.equal(bare[0].text, "select 1");
});

test("comment-only and empty scripts yield zero statements", () => {
  assert.equal(splitPostgresScript("-- just a comment").length, 0);
  assert.equal(splitPostgresScript("   \n  ").length, 0);
  assert.equal(splitPostgresScript("/* block */").length, 0);
});

test("escaped single quotes do not end strings", () => {
  const parts = splitPostgresScript("insert into t values ('it''s; fine'); select 1;");
  assert.equal(parts.length, 2);
});

test("script statement limit is 500 and over-limit scripts are rejected before execution", async () => {
  assert.equal(MAX_SCRIPT_STATEMENTS, 500);
  const overLimit = Array.from({ length: 501 }, (_, index) => `select ${index + 1};`).join("\n");
  assert.equal(splitPostgresScript(overLimit).length, 501);
  // The limit gate runs before any database connection is opened.
  const outcome = await executeScript(overLimit);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.executedStatements, 0);
  assert.match(outcome.message, /exceeds the limit of 500/);
});

test("detects statements that cannot run inside a transaction", () => {
  assert.equal(isNonTransactionalStatement("VACUUM analyze;"), true);
  assert.equal(isNonTransactionalStatement("create index concurrently idx on t (a);"), true);
  assert.equal(isNonTransactionalStatement("create index idx on t (a);"), false);
  assert.equal(isNonTransactionalStatement("create table t (id int);"), false);
  const parts = splitPostgresScript("select 1; vacuum; select 2;");
  const bad = findNonTransactionalStatements(parts);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].index, 2);
});

test("transaction mode parsing defaults to atomic transaction", () => {
  assert.equal(parseScriptTransactionMode(undefined), "transaction");
  assert.equal(parseScriptTransactionMode("transaction"), "transaction");
  assert.equal(parseScriptTransactionMode("autocommit"), "autocommit");
  assert.throws(() => parseScriptTransactionMode("whatever"), /transactionMode/);
});

test("script outcome guard accepts script outcomes and rejects single-statement ones", () => {
  const script = {
    ok: true,
    kind: "script",
    totalStatements: 2,
    executedStatements: 2,
    transactionMode: "transaction",
    results: [],
    durationMs: 5,
  };
  assert.equal(isScriptOutcome(script), true);
  assert.equal(isQueryOutcome(script), false);
  const single = { ok: true, columns: ["a"], rows: [], rowCount: 0, durationMs: 1, truncated: false };
  assert.equal(isQueryOutcome(single), true);
  assert.equal(isScriptOutcome(single), false);
});

test("single-statement validation still applies to script input", () => {
  assert.equal(validateSqlText("select 1"), "select 1");
  assert.throws(() => validateSqlText("  "), /non-empty/);
});

test("statement previews are short single-line summaries", () => {
  const preview = statementPreview("select\n  1;");
  assert.equal(preview.includes("\n"), false);
});

test("001_chat.sql migration parses into executable statements (dry run, no execution)", () => {
  const url = new URL("../../alvo-dashboard-/db/migrations/001_chat.sql", import.meta.url);
  let text;
  try {
    text = readFileSync(url, "utf8");
  } catch {
    // Fall back to the absolute path used in the task description.
    text = readFileSync("C:\\Users\\aditya\\alvo-dashboard-\\db\\migrations\\001_chat.sql", "utf8");
  }
  const parts = splitPostgresScript(text);
  // 2 CREATE TABLE + 12 ALTER TABLE + 2 DO blocks + 2 CREATE INDEX = 18.
  assert.equal(parts.length, 18);
  assert.equal(findNonTransactionalStatements(parts).length, 0);
  assert.ok(parts.some((part) => /^\s*do\s+\$\$/i.test(part.text)));
  assert.ok(parts.some((part) => /create index/i.test(part.text)));
});
