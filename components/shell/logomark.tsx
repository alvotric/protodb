import { cn } from "@/lib/utils";

export function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-5 w-5", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#2be0c9" />
      <path
        d="M10 9C10 8.44772 10.4477 8 11 8H16.5C19.5376 8 22 10.4624 22 13.5C22 16.5376 19.5376 19 16.5 19H14V23C14 23.5523 13.5523 24 13 24H11C10.4477 24 10 23.5523 10 23V9Z"
        fill="#090c11"
      />
      <circle cx="16.5" cy="13.5" r="2.5" fill="#2be0c9" />
    </svg>
  );
}
