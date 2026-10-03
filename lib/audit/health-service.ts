import { getDatabaseConnectionSnapshot } from "@/lib/dashboard/stats-service";
import { createSystemHealthSnapshot } from "@/lib/audit/health-policy";

export async function getSystemHealthSnapshot() {
  const stats = await getDatabaseConnectionSnapshot();
  return createSystemHealthSnapshot(
    { activeConnections: stats.activeConnections, maxConnections: stats.maxConnections },
    new Date()
  );
}
