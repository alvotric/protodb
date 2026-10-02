export type ExportCell = unknown;

function cellText(value: ExportCell): string {
  if (value === null) return "\\N";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value) ?? "";
  return String(value);
}

function safeSpreadsheetCell(value: ExportCell): string {
  const text = cellText(value);
  return /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvField(value: ExportCell): string {
  const text = safeSpreadsheetCell(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: string[], rows: Record<string, ExportCell>[]): string {
  const lines = [
    columns.map((column) => csvField(column)).join(","),
    ...rows.map((row) => columns.map((column) => csvField(row[column])).join(",")),
  ];
  return lines.join("\r\n");
}

export function toJson(rows: Record<string, ExportCell>[]): string {
  return JSON.stringify(rows, null, 2);
}
