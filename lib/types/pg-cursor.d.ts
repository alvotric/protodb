declare module "pg-cursor" {
  import type { FieldDef, Submittable } from "pg";

  interface CursorResult {
    command: string;
    fields: FieldDef[];
    rowCount: number | null;
  }

  class Cursor implements Submittable {
    constructor(text: string, values?: unknown[], config?: { rowMode?: "array" });
    submit: (connection: Parameters<Submittable["submit"]>[0]) => void;
    read(
      rows: number,
      callback: (error: Error | null, rows: unknown[][], result: CursorResult) => void
    ): void;
    close(callback: (error?: Error) => void): void;
  }

  export = Cursor;
}
