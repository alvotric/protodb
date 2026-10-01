import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md bg-gradient-to-r from-surface-hover via-border to-surface-hover bg-[length:200%_100%]",
        className
      )}
    />
  );
}
