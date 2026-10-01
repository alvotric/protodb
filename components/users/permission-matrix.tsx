"use client";

import { Check, Pencil, Eye, Ban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PermissionLevel, ResourcePermission } from "@/lib/mock-data";

const LEVELS: PermissionLevel[] = ["full", "edit", "view", "none"];

const LEVEL_META: Record<PermissionLevel, { icon: typeof Check; label: string; className: string }> = {
  full: { icon: Check, label: "Full", className: "text-success bg-success-soft" },
  edit: { icon: Pencil, label: "Edit", className: "text-accent bg-accent-soft" },
  view: { icon: Eye, label: "View", className: "text-warning bg-warning-soft" },
  none: { icon: Ban, label: "None", className: "text-ink-faint bg-surface-hover" },
};

/**
 * Phase 8 — Users, Roles & Permissions.
 * Owner and Admin columns are shown but fixed (an Owner having less
 * than full access everywhere, or Admin being unable to manage the
 * workspace, isn't a real configuration this app offers) -- only
 * Editor and Viewer are adjustable, cycling through the four levels
 * on click. Matches the roadmap's own boundary: four fixed roles,
 * not a custom role builder.
 */
export function PermissionMatrix({
  permissions,
  onChange,
}: {
  permissions: ResourcePermission[];
  onChange: (resource: string, role: "editor" | "viewer", level: PermissionLevel) => void;
}) {
  function cycle(current: PermissionLevel): PermissionLevel {
    const idx = LEVELS.indexOf(current);
    return LEVELS[(idx + 1) % LEVELS.length];
  }

  return (
    <Card className="overflow-x-auto p-1">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted">Resource</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted">Owner</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted">Admin</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted">Editor</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted">Viewer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {permissions.map((row) => (
            <tr key={row.resource}>
              <td className="px-4 py-2.5 text-ink">{row.resource}</td>
              <td className="px-4 py-2.5 text-center">
                <LevelPill level={row.owner} />
              </td>
              <td className="px-4 py-2.5 text-center">
                <LevelPill level={row.admin} />
              </td>
              <td className="px-4 py-2.5 text-center">
                <LevelPill level={row.editor} onClick={() => onChange(row.resource, "editor", cycle(row.editor))} />
              </td>
              <td className="px-4 py-2.5 text-center">
                <LevelPill level={row.viewer} onClick={() => onChange(row.resource, "viewer", cycle(row.viewer))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LevelPill({ level, onClick }: { level: PermissionLevel; onClick?: () => void }) {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  const classes = cn(
    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
    meta.className,
    onClick && "cursor-pointer transition-transform hover:scale-105"
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={classes}>
        <Icon className="h-3 w-3" />
        {meta.label}
      </button>
    );
  }

  return (
    <div className={classes}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </div>
  );
}
