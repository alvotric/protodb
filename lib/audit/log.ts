import { query } from "@/lib/db/client";

/**
 * Phase 10 — Backend API & Real Data Integration.
 * Writes a real row into `protodb_admin.audit_log` (migrations/001).
 * Best-effort by design: a logging failure should never be the reason
 * a real write (a row update, a login) itself fails, so this never
 * throws -- it swallows its own errors after printing one to the
 * server console.
 */
export async function logAuditEvent(entry: {
  actor: string;
  action: string;
  resource: string;
  result: "success" | "failed";
  ip?: string;
}): Promise<void> {
  try {
    await query(
      `insert into protodb_admin.audit_log (actor, action, resource, result, ip) values ($1, $2, $3, $4, $5)`,
      [entry.actor, entry.action, entry.resource, entry.result, entry.ip ?? "—"]
    );
  } catch (err) {
    console.error("Failed to write audit log entry:", err);
  }
}
