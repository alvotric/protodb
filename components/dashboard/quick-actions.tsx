import Link from "next/link";
import { TerminalSquare, Table, UserPlus, ScrollText } from "lucide-react";
import { Card } from "@/components/ui/card";

const actions = [
  { href: "/queries", icon: TerminalSquare, label: "Run a query", description: "Open the SQL editor" },
  { href: "/database", icon: Table, label: "New table", description: "Define a schema" },
  { href: "/users", icon: UserPlus, label: "Invite teammate", description: "Grant access" },
  { href: "/audit", icon: ScrollText, label: "View audit log", description: "Recent system events" },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {actions.map((action) => (
        <Link key={action.href} href={action.href}>
          <Card className="flex items-center gap-3 p-4 transition-colors hover:border-border-strong">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <action.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{action.label}</p>
              <p className="truncate text-xs text-ink-faint">{action.description}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
