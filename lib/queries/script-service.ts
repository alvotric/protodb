import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import {
  MAX_SCRIPT_STATEMENTS,
  findNonTransactionalStatements,
  splitPostgresScript,
  type SplitStatement,
} from "@/lib/queries/script-splitter";
import { SQL_STATEMENT_TIMEOUT_MS, positionToLocation, safePostgresError } from "@/lib/queries/query-policy";
import type { ScriptFailure, ScriptOutcome, ScriptTransactionMode } from "@/lib/queries/types";

export interface ExecuteScriptOptions {
  transactionMode?: ScriptTransactionMode;
}

export function parseScriptTransactionMode(value: unknown): ScriptTransactionMode {
  if (value === undefined) return "transaction";
  if (value === "transaction" || value === "autocommit") return value;
  throw new Error("transactionMode must be \"transaction\" or \"autocommit\".");
}

function commandOf(result: { command?: unknown }): string {
  return typeof result.command === "string" && result.command.length > 0 ? result.command : "UNKNOWN";
}

/**
 * Executes a multi-statement PostgreSQL script statement-by-statement on one
 * pooled client, using the simple query protocol (which supports DDL and
 * dollar-quoted bodies such as DO $$ ... $$;).
 *
 * Transaction behavior:
 * - "transaction" (default, atomic): BEGIN once, run every statement, COMMIT
 *   on full success, ROLLBACK on the first failure. Scripts containing
 *   statements PostgreSQL forbids inside a transaction block (VACUUM,
 *   CREATE INDEX CONCURRENTLY, CREATE/DROP DATABASE, ...) are rejected
 *   BEFORE anything runs, naming the offending statement numbers and
 *   pointing at the "autocommit" mode instead. Nothing is partially applied
 *   by this rejection path.
 * - "autocommit": each statement commits on its own; a failure stops the
 *   run and reports which statement failed, leaving earlier statements
 *   applied. Use this for scripts with non-transactional statements.
 */
export async function executeScript(rawSql: string, options: ExecuteScriptOptions = {}): Promise<ScriptOutcome> {
  const startedAt = performance.now();
  const transactionMode = options.transactionMode ?? "transaction";
  const statements: SplitStatement[] = splitPostgresScript(rawSql);

  if (statements.length === 0) {
    return {
      ok: false,
      kind: "script",
      totalStatements: 0,
      executedStatements: 0,
      failedStatement: null,
      message: "No executable statements were found. The script contains only comments or whitespace.",
      transactionMode,
      results: [],
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  if (statements.length > MAX_SCRIPT_STATEMENTS) {
    return {
      ok: false,
      kind: "script",
      totalStatements: statements.length,
      executedStatements: 0,
      failedStatement: null,
      message: `The script contains ${statements.length} statements, which exceeds the limit of ${MAX_SCRIPT_STATEMENTS}. Split the migration into smaller scripts.`,
      transactionMode,
      results: [],
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  if (transactionMode === "transaction") {
    const nonTransactional = findNonTransactionalStatements(statements);
    if (nonTransactional.length > 0) {
      const numbers = nonTransactional.map((statement) => statement.index).join(", ");
      const first = nonTransactional[0];
      return {
        ok: false,
        kind: "script",
        totalStatements: statements.length,
        executedStatements: 0,
        failedStatement: first.index,
        failedPreview: first.preview,
        message: `Statement ${numbers} cannot run inside a transaction block (e.g. VACUUM, CONCURRENTLY index builds, CREATE/DROP DATABASE). Nothing was executed. Re-run this script in autocommit mode instead.`,
        code: "25001",
        transactionMode,
        results: [],
        durationMs: Math.round(performance.now() - startedAt),
      };
    }
  }

  let client: PoolClient | null = null;
  let transactionOpen = false;
  let discardClient = false;
  const results: ScriptFailure["results"] = [];

  try {
    client = await getPool().connect();

    if (transactionMode === "transaction") {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(`SET LOCAL statement_timeout = '${SQL_STATEMENT_TIMEOUT_MS}ms'`);
    } else {
      await client.query(`SET statement_timeout = '${SQL_STATEMENT_TIMEOUT_MS}ms'`);
    }

    for (const statement of statements) {
      const statementStarted = performance.now();
      try {
        // Simple-protocol query: supports DDL + dollar-quoted bodies.
        // Parameters are intentionally absent -- scripts are literal
        // migration text, and splitting already isolated each statement.
        const result = await client.query(statement.text);
        results.push({
          index: statement.index,
          preview: statement.preview,
          command: commandOf(result),
          rowCount: typeof result.rowCount === "number" ? result.rowCount : null,
          durationMs: Math.round(performance.now() - statementStarted),
        });
      } catch (error) {
        const safeError = safePostgresError(error);
        const absolutePosition =
          typeof safeError.position === "number" ? statement.start + safeError.position : undefined;
        const location =
          absolutePosition !== undefined ? positionToLocation(rawSql, absolutePosition) : undefined;
        const durationMs = Math.round(performance.now() - startedAt);
        if (transactionOpen) {
          try {
            await client.query("ROLLBACK");
          } catch {
            discardClient = true;
          }
          transactionOpen = false;
        }
        const failure: ScriptFailure = {
          ok: false,
          kind: "script",
          totalStatements: statements.length,
          executedStatements: results.length,
          failedStatement: statement.index,
          failedPreview: statement.preview,
          message:
            transactionMode === "transaction"
              ? `Statement ${statement.index} of ${statements.length} failed; the transaction was rolled back. ${safeError.message}`
              : `Statement ${statement.index} of ${statements.length} failed; ${results.length} statement(s) were already applied. ${safeError.message}`,
          ...(safeError.code ? { code: safeError.code } : {}),
          ...(absolutePosition !== undefined ? { position: absolutePosition } : {}),
          ...(location ? { location: { offset: location.offset, line: location.line, column: location.column } } : {}),
          transactionMode,
          results,
          durationMs,
        };
        return failure;
      }
    }

    if (transactionOpen) {
      await client.query("COMMIT");
      transactionOpen = false;
    }

    return {
      ok: true,
      kind: "script",
      totalStatements: statements.length,
      executedStatements: results.length,
      transactionMode,
      results,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    const safeError = safePostgresError(error);
    return {
      ok: false,
      kind: "script",
      totalStatements: statements.length,
      executedStatements: results.length,
      failedStatement: null,
      message: safeError.message,
      ...(safeError.code ? { code: safeError.code } : {}),
      transactionMode,
      results,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    if (client) {
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch {
          discardClient = true;
        }
      }
      try {
        await client.query("RESET statement_timeout");
        await client.query("RESET SESSION AUTHORIZATION");
        await client.query("RESET ROLE");
      } catch {
        discardClient = true;
      }
      client.release(discardClient ? new Error("Discarding script execution connection after cleanup failure.") : undefined);
    }
  }
}
