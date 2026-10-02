export interface BoundedRows {
  rows: Record<string, unknown>[];
  byteLength: number;
  truncated: boolean;
}

export function appendBoundedRows(
  columns: string[],
  currentRows: Record<string, unknown>[],
  currentBytes: number,
  values: unknown[][],
  maxRows: number,
  maxBytes: number
): BoundedRows {
  const rows: Record<string, unknown>[] = [];
  let byteLength = currentBytes;
  let truncated = false;

  for (const rowValues of values) {
    if (currentRows.length + rows.length >= maxRows) {
      truncated = true;
      break;
    }
    const row = Object.fromEntries(columns.map((column, index) => [column, rowValues[index] ?? null]));
    const rowBytes = Buffer.byteLength(JSON.stringify(row), "utf8");
    if (byteLength + rowBytes > maxBytes) {
      truncated = true;
      break;
    }
    rows.push(row);
    byteLength += rowBytes;
  }

  return { rows, byteLength, truncated };
}
