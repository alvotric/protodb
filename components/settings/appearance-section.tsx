"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTheme, type ThemeChoice } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: ThemeChoice; label: string; description: string }> = [
  { value: "dark", label: "Dark", description: "Developer console look." },
  { value: "light", label: "Light", description: "Clean white surfaces." },
  { value: "system", label: "System", description: "Follows your OS setting." },
];

export function AppearanceSection() {
  const { choice, setChoice } = useTheme();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Saved in this browser. Applies instantly without a reload.</CardDescription>
        </div>
      </CardHeader>
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((option) => {
          const active = choice === option.value;
          return (
            <button
              key={option.value}
              role="radio"
              aria-checked={active}
              onClick={() => setChoice(option.value)}
              className={cn(
                "rounded-lg border px-3 py-3 text-left transition-colors",
                active
                  ? "border-accent-line bg-accent-soft"
                  : "border-border bg-surface hover:border-border-strong"
              )}
            >
              <span className="text-sm font-medium text-ink">{option.label}</span>
              <span className="mt-0.5 block text-xs text-ink-faint">{option.description}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
