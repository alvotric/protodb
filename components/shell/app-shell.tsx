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
import type { SessionUser } from "@/lib/auth/session";

export function AppShell({ title, user, children }: { title: string; user: SessionUser; children: ReactNode }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [liveTables, setLiveTables] = useState<Array<{ schema: string; name: string }>>([]);

  useEffect(() => {
    if (!paletteOpen || liveTables.length > 0) return;

    const controller = new AbortController();

    fetch("/api/database/schema?includePartitioned=true", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !body || typeof body !== "object" || !("tables" in body) || !Array.isArray((body as { tables?: unknown }).tables)) {
          return;
        }

        const tables = (body as { tables: unknown[] }).tables.filter(
          (table): table is { schema: string; name: string } =>
            !!table &&
            typeof table === "object" &&
            typeof (table as { schema?: unknown }).schema === "string" &&
            typeof (table as { name?: unknown }).name === "string"
        );

        setLiveTables(tables);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLiveTables([]);
        }
      });

    return () => controller.abort();
  }, [liveTables.length, paletteOpen]);

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

  const tableItems: CommandItem[] = liveTables.map((table) => ({
    id: `table-${table.schema}-${table.name}`,
    label: table.name,
    hint: table.schema,
    group: "Tables",
    icon: <Table2 className="h-4 w-4" />,
    onSelect: () =>
      router.push(
        `/database?schema=${encodeURIComponent(table.schema)}&table=${encodeURIComponent(table.name)}`
      ),
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
