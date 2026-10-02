import Cursor from "pg-cursor";
import type { FieldDef, PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import {
  MAX_RESULT_BYTES,
  MAX_RESULT_ROWS,
  SQL_STATEMENT_TIMEOUT_MS,
  positionToLocation,
  safePostgresError,
} from "@/lib/queries/query-policy";
import { appendBoundedRows } from "@/lib/queries/result-limits";
import type { QueryOutcome, QuerySuccess } from "@/lib/queries/types";

const FETCH_BATCH_SIZE = 25;

interface CursorBatch {
  rows: unknown[][];
  fields: FieldDef[];
  command: string;
  rowCount: number | null;
}

function readCursor(cursor: Cursor, count: number): Promise<CursorBatch> {
  return new Promise((resolve, reject) => {
    cursor.read(count, (error, rows, result) => {
      if (error) reject(error);
      else resolve({ rows, fields: result.fields, command: result.command, rowCount: result.rowCount });
    });
  });
}

function closeCursor(cursor: Cursor): Promise<void> {
  return new Promise((resolve, reject) => {
    cursor.close((error) => error ? reject(error) : resolve());
  });
}

function displayColumnNames(fields: FieldDef[]): string[] {
  const seen = new Map<string, number>();
  return fields.map((field) => {
    const count = (seen.get(field.name) ?? 0) + 1;
    seen.set(field.name, count);
    return count === 1 ? field.name : `${field.name} (${count})`;
  });
}

function failure(error: unknown, sql: string, durationMs: number): QueryOutcome {
  const safeError = safePostgresError(error);
  const location = positionToLocation(sql, safeError.position);
  return {
    ok: false,
    ...safeError,
    ...(location ? { location: { offset: location.offset, line: location.line, column: location.column } } : {}),
    durationMs,
  };
}

/**
 * Executes exactly one PostgreSQL statement on a pooled client.
 * PostgreSQL's extended-protocol cursor rejects multiple statements;
 * the statement runs inside a transaction with a local timeout. Results
 * are fetched in bounded batches and capped before returning to the UI.
 */
export async function executeSql(sql: string): Promise<QueryOutcome> {
  const startedAt = performance.now();
  let client: PoolClient | null = null;
  let cursor: Cursor | null = null;
  let transactionOpen = false;
  let discardClient = false;
  let completed = false;

  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(`SET LOCAL statement_timeout = '${SQL_STATEMENT_TIMEOUT_MS}ms'`);

    cursor = new Cursor(sql, [], { rowMode: "array" });
    client.query(cursor);
    const columns: string[] = [];
    const rows: Record<string, unknown>[] = [];
    let resultRowCount: number | null = null;
    let command = "";
    let totalBytes = 0;
    let truncated = false;
    let cursorFinished = false;

    while (rows.length <= MAX_RESULT_ROWS && !truncated) {
      const remaining = MAX_RESULT_ROWS + 1 - rows.length;
      const batch = await readCursor(cursor, Math.min(FETCH_BATCH_SIZE, remaining));
      command = batch.command || command;
      resultRowCount = batch.rowCount ?? resultRowCount;
      if (columns.length === 0) {
        columns.push(...displayColumnNames(batch.fields));
      }
      if (batch.rows.length < Math.min(FETCH_BATCH_SIZE, remaining)) cursorFinished = true;

      const bounded = appendBoundedRows(columns, rows, totalBytes, batch.rows, MAX_RESULT_ROWS, MAX_RESULT_BYTES);
      rows.push(...bounded.rows);
      totalBytes = bounded.byteLength;
      truncated = bounded.truncated;

      if (cursorFinished || batch.rows.length === 0) break;
    }

    if (!cursorFinished) await closeCursor(cursor);
    cursor = null;

    const transactionStatus = client.getTransactionStatus();
    if (transactionStatus === "E") throw new Error("PostgreSQL transaction is in a failed state.");
    if (transactionStatus === "T") {
      await client.query("COMMIT");
    }
    transactionOpen = false;
    completed = true;

    const rowCount = command === "SELECT" ? rows.length : resultRowCount ?? rows.length;
    const outcome: QuerySuccess = {
      ok: true,
      columns,
      rows,
      rowCount,
      durationMs: Math.round(performance.now() - startedAt),
      truncated,
    };
    return outcome;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    return failure(error, sql, durationMs);
  } finally {
    if (cursor) {
      try {
        await closeCursor(cursor);
      } catch {
        discardClient = true;
      }
    }
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discardClient = true;
      }
    }
    if (client) {
      if (completed) {
        try {
          await client.query("RESET SESSION AUTHORIZATION");
          await client.query("RESET ROLE");
          await client.query("DISCARD ALL");
        } catch {
          discardClient = true;
        }
      }
      client.release(discardClient ? new Error("Discarding SQL execution connection after cleanup failure.") : undefined);
    }
  }
}
