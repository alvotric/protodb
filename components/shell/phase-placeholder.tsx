import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function PhasePlaceholder({
  icon: Icon,
  phase,
  title,
  description,
}: {
  icon: LucideIcon;
  phase: string;
  title: string;
  description: string;
}) {
  return (
    <Card className="flex flex-col items-center px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent-line bg-accent-soft text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 font-mono text-xs text-ink-faint">{phase}</p>
      <h2 className="mt-1.5 text-lg font-medium text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">{description}</p>
    </Card>
  );
}
