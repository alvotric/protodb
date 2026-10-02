import { Card } from "@/components/ui/card";
import { APP_ROLES, ROLE_CAPABILITIES, ROLE_CAPABILITY_DESCRIPTIONS, type RoleCapability } from "@/lib/auth/role-capabilities";

const DISPLAYED_CAPABILITIES: RoleCapability[] = [
  "executeSql",
  "manageSchema",
  "mutateTableData",
  "readStorage",
  "writeStorage",
  "manageStorage",
];

export function RoleCapabilities() {
  return (
    <Card className="mt-4 overflow-x-auto p-1">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-medium text-ink">Current server-enforced role capabilities</h2>
        <p className="mt-1 text-xs text-ink-muted">
          This documents existing API guards. It is separate from the editable demo resource examples above.
        </p>
      </div>
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted">Capability</th>
            {APP_ROLES.map((role) => (
              <th key={role} className="px-4 py-3 text-center text-xs font-medium text-ink-muted">{role}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {DISPLAYED_CAPABILITIES.map((capability) => (
            <tr key={capability}>
              <td className="px-4 py-2.5 text-ink">{ROLE_CAPABILITY_DESCRIPTIONS[capability]}</td>
              {APP_ROLES.map((role) => (
                <td key={role} className="px-4 py-2.5 text-center text-xs">
                  {ROLE_CAPABILITIES[role][capability] ? (
                    <span className="text-success">Allowed</span>
                  ) : (
                    <span className="text-ink-faint">Not allowed</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 pb-3 pt-2 text-[11px] text-ink-faint">
        Active-account status is also required. These app role checks do not express PostgreSQL privileges or per-resource overrides.
      </p>
    </Card>
  );
}
