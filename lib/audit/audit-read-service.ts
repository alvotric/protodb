import { query, queryOne } from "@/lib/db/client";
import { buildAuditSql, type AuditQueryFilters } from "@/lib/audit/audit-query";

export type AuditRecord = {
  id: string;
  actor: string;
  action: string;
  resource: string;
  result: "success" | "failed";
  ip: string | null;
  at: string;
};

type AuditRow = Omit<AuditRecord, "at"> & { at: Date | string };

export async function readAuditPage(filters: AuditQueryFilters): Promise<{ events: AuditRecord[]; total: number }> {
  const statements = buildAuditSql(filters);
  const [count, rows] = await Promise.all([
    queryOne<{ total: string }>(statements.count.text, statements.count.values),
    query<AuditRow>(statements.list.text, statements.list.values),
  ]);

  if (!count) throw new Error("Audit count query returned no result.");
  const total = Number(count.total);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Audit count query returned an invalid result.");

  return {
    total,
    events: rows.map((row) => ({
      ...row,
      at: new Date(row.at).toISOString(),
    })),
  };
}
