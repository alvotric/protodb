import type { Config } from "tailwindcss";

/**
 * ProtoDB Admin — design tokens.
 *
 * "Spatial Flow" direction from the roadmap brief: dark, precise,
 * developer-first. One accent color (teal-cyan), used deliberately —
 * primary actions, active nav state, key metrics, focus rings — never
 * as decoration. Fira Code marks anything technical (SQL, IDs,
 * timestamps, code); Space Grotesk carries everything else. That
 * split is itself a piece of visual structure: monospace means "raw
 * system value", not a stylistic default.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-fira-code)", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.2rem" }],
        base: ["0.875rem", { lineHeight: "1.4rem" }],
        md: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.6rem" }],
        xl: ["1.25rem", { lineHeight: "1.7rem" }],
        "2xl": ["1.5rem", { lineHeight: "1.9rem" }],
        "3xl": ["2rem", { lineHeight: "2.3rem" }],
        "4xl": ["2.5rem", { lineHeight: "2.7rem" }],
      },
      colors: {
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--c-surface) / <alpha-value>)",
          raised: "rgb(var(--c-surface-raised) / <alpha-value>)",
          hover: "rgb(var(--c-surface-hover) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--c-border) / <alpha-value>)",
          strong: "rgb(var(--c-border-strong) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          muted: "rgb(var(--c-ink-muted) / <alpha-value>)",
          faint: "rgb(var(--c-ink-faint) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          soft: "rgba(43, 224, 201, 0.12)",
          line: "rgba(43, 224, 201, 0.35)",
        },
        success: { DEFAULT: "rgb(var(--c-success) / <alpha-value>)", soft: "rgba(74, 222, 156, 0.12)" },
        warning: { DEFAULT: "rgb(var(--c-warning) / <alpha-value>)", soft: "rgba(245, 185, 77, 0.12)" },
        danger: { DEFAULT: "rgb(var(--c-danger) / <alpha-value>)", soft: "rgba(242, 104, 92, 0.12)" },
      },
      borderRadius: {
        md: "8px",
        lg: "11px",
        xl: "14px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(43, 224, 201, 0.25), 0 8px 24px -8px rgba(43, 224, 201, 0.35)",
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -16px rgba(0,0,0,0.6)",
        raised: "0 16px 48px -12px rgba(0,0,0,0.7)",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(180deg, rgba(43,224,201,0.06), transparent 60%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
