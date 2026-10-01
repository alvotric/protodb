import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  series,
  tone = "accent",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
  series?: number[];
  tone?: "accent" | "success";
}) {
  const toneClasses =
    tone === "success"
      ? { icon: "text-success bg-success-soft", line: "text-success" }
      : { icon: "text-accent bg-accent-soft", line: "text-accent" };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", toneClasses.icon)}>
          <Icon className="h-4 w-4" />
        </div>
        {series && (
          <Sparkline data={series} className={cn("h-8 w-20", toneClasses.line)} />
        )}
      </div>
      <p className="mt-4 text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-medium tracking-tight text-ink">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-ink-faint">{sublabel}</p>}
    </Card>
  );
}
