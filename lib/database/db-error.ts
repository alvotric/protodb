import { NextResponse } from "next/server";
import { SchemaValidationError } from "@/lib/database/schema-validation";
import { TableDataValidationError } from "@/lib/database/table-data-service";
import { DdlValidationError } from "@/lib/database/ddl-service";

function postgresCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err && typeof (err as { code?: unknown }).code === "string"
    ? (err as { code: string }).code
    : "";
}

function isValidationError(err: unknown): err is Error {
  return (
    err instanceof SchemaValidationError ||
    err instanceof TableDataValidationError ||
    err instanceof DdlValidationError
  );
}

/**
 * Safe error mapping for database read routes (GET).
 * Validation messages are client-safe; PostgreSQL/driver internals are
 * logged server-side and replaced with a generic fallback.
 */
export function safeDbReadError(err: unknown, fallback: string) {
  if (isValidationError(err)) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
  console.error(fallback, err);
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}

/**
 * Safe error mapping for DDL/table-data mutation routes.
 * Validation messages are client-safe (400). Known PostgreSQL
 * constraint/type violations map to a generic 400 without leaking
 * catalog details. Anything else is logged and returned as a generic
 * failure so connection strings, paths, and PG internals never reach
 * the browser.
 */
export function safeDbMutationError(err: unknown, fallback: string) {
  if (isValidationError(err)) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
  const code = postgresCode(err);
  if (code === "23505") {
    console.error(`${fallback} (unique violation)`, err);
    return NextResponse.json(
      { ok: false, error: "This operation conflicts with an existing database object or value." },
      { status: 409 }
    );
  }
  if (
    code.startsWith("22") ||
    code.startsWith("23") ||
    code === "42P01" ||
    code === "42703" ||
    code === "42P07"
  ) {
    console.error(`${fallback} (constraint/object)`, err);
    return NextResponse.json(
      { ok: false, error: "PostgreSQL rejected the operation because of a type, constraint, or missing object." },
      { status: 400 }
    );
  }
  console.error(fallback, err);
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}
