import { type InputHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  error?: string;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, error, mono, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              "h-9 w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-ink-faint",
              "transition-colors duration-150 focus:outline-none",
              error ? "border-danger/40" : "border-border focus:border-accent-line",
              icon && "pl-9",
              mono && "font-mono",
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
