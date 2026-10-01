"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  TerminalSquare,
  HardDrive,
  Users,
  ScrollText,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logomark } from "@/components/shell/logomark";
import { dbHealth } from "@/lib/mock-data";

const primaryNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/database", label: "Database", icon: Database },
  { href: "/queries", label: "Queries", icon: TerminalSquare },
  { href: "/storage", label: "Storage", icon: HardDrive },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
];

const secondaryNav = [{ href: "/settings", label: "Settings", icon: Settings }];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface/60">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Logomark />
        <span className="text-sm font-semibold tracking-tight text-ink">ProtoDB</span>
        <span className="ml-auto rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
          v0.1
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        <p className="px-2.5 pb-1.5 text-xs font-medium text-ink-faint">Workspace</p>
        <ul className="space-y-0.5">
          {primaryNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                    active
                      ? "bg-accent-soft text-ink"
                      : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", active ? "text-accent" : "text-ink-faint")} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="px-2.5 pb-1.5 pt-5 text-xs font-medium text-ink-faint">Account</p>
        <ul className="space-y-0.5">
          {secondaryNav.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                    active
                      ? "bg-accent-soft text-ink"
                      : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", active ? "text-accent" : "text-ink-faint")} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 border-t border-border pt-4">
          <p className="px-2.5 pb-1.5 text-xs font-medium text-ink-faint">Phase 1</p>
          <Link
            href="/components"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
              pathname === "/components"
                ? "bg-accent-soft text-ink"
                : "text-ink-muted hover:bg-surface-hover hover:text-ink"
            )}
          >
            <SlidersHorizontal
              className={cn("h-4 w-4", pathname === "/components" ? "text-accent" : "text-ink-faint")}
            />
            Design system
          </Link>
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-xs text-ink-muted">Connected</span>
          </div>
          <span className="font-mono text-xs text-ink-faint">{dbHealth.avgQueryMs}ms</span>
        </div>
      </div>
    </aside>
  );
}
