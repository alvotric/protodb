"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeChoice = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "protodb-theme";

function resolveChoice(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return "dark";
  }
  return choice;
}

function applyResolved(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

interface ThemeContextValue {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ choice: "dark", resolved: "dark", setChoice: () => {} });

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    let initial: ThemeChoice = "dark";
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "dark" || stored === "light" || stored === "system") initial = stored;
    } catch {
      initial = "dark";
    }
    setChoiceState(initial);
    setResolved(resolveChoice(initial));
    applyResolved(resolveChoice(initial));
  }, []);

  useEffect(() => {
    if (choice !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const next = resolveChoice("system");
      setResolved(next);
      applyResolved(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    const nextResolved = resolveChoice(next);
    setResolved(nextResolved);
    applyResolved(nextResolved);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-mode storage may reject; theme still applies for the session.
    }
  }, []);

  return <ThemeContext.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeContext.Provider>;
}

/**
 * Inline blocking script rendered in <head> so the saved theme applies
 * before first paint. Defaults to dark to preserve the existing look
 * when nothing is stored.
 */
export function ThemeScript() {
  const code = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var c=(s==='light'||s==='dark'||s==='system')?s:'dark';var r=c==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):c;document.documentElement.classList.toggle('dark',r==='dark');document.documentElement.classList.toggle('light',r==='light');document.documentElement.style.colorScheme=r;}catch(e){document.documentElement.classList.add('dark');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
