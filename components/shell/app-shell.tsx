"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  TerminalSquare,
  HardDrive,
  Users,
  ScrollText,
  Settings,
  Table2,
} from "lucide-react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette, type CommandItem } from "@/components/ui/command-palette";
import { tables } from "@/lib/mock-data";
import type { SessionUser } from "@/lib/auth/session";

export function AppShell({ title, user, children }: { title: string; user: SessionUser; children: ReactNode }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const navItems: CommandItem[] = [
    { id: "nav-dashboard", label: "Dashboard", group: "Navigate", icon: <LayoutDashboard className="h-4 w-4" />, onSelect: () => router.push("/dashboard") },
    { id: "nav-database", label: "Database", group: "Navigate", icon: <Database className="h-4 w-4" />, onSelect: () => router.push("/database") },
    { id: "nav-queries", label: "Queries", group: "Navigate", icon: <TerminalSquare className="h-4 w-4" />, onSelect: () => router.push("/queries") },
    { id: "nav-storage", label: "Storage", group: "Navigate", icon: <HardDrive className="h-4 w-4" />, onSelect: () => router.push("/storage") },
    { id: "nav-users", label: "Users", group: "Navigate", icon: <Users className="h-4 w-4" />, onSelect: () => router.push("/users") },
    { id: "nav-audit", label: "Audit Log", group: "Navigate", icon: <ScrollText className="h-4 w-4" />, onSelect: () => router.push("/audit") },
    { id: "nav-settings", label: "Settings", group: "Navigate", icon: <Settings className="h-4 w-4" />, onSelect: () => router.push("/settings") },
  ];

  const tableItems: CommandItem[] = tables.map((t) => ({
    id: `table-${t.name}`,
    label: t.name,
    hint: t.schema,
    group: "Tables",
    icon: <Table2 className="h-4 w-4" />,
    onSelect: () => router.push("/database"),
  }));

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} user={user} onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-6 py-6">{children}</div>
        </main>
      </div>
      <CommandPalette items={[...navItems, ...tableItems]} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
