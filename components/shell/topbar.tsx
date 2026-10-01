"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Bell, ChevronDown, LogOut, Settings, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { notifications as initialNotifications, timeAgo } from "@/lib/mock-data";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Phase 10 — Backend API & Real Data Integration.
 * `user` now comes from the real signed-in session (see
 * lib/auth/session.ts#getCurrentUser, called by every page.tsx and
 * passed down through AppShell) rather than the static
 * lib/mock-data.ts#currentUser every earlier phase used. Sign out is
 * real too: it calls the logout route, which deletes the session row
 * and clears the cookie, then sends you back to /login.
 *
 * Notifications remain lib/mock-data.ts's seed list -- Phase 10's
 * later continuation is what wires real event-driven notifications
 * up to the same `protodb_admin` schema this auth work introduced.
 */
export function Topbar({
  title,
  user,
  onOpenPalette,
}: {
  title: string;
  user: SessionUser;
  onOpenPalette: () => void;
}) {
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [signingOut, setSigningOut] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-canvas/80 px-5 backdrop-blur">
      <h1 className="text-md font-medium text-ink">{title}</h1>

      <button
        onClick={onOpenPalette}
        className="ml-2 flex h-8 flex-1 max-w-sm items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-ink-faint transition-colors hover:border-border-strong"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                className="glass absolute right-0 top-11 z-40 w-80 rounded-xl border border-border-strong bg-surface-raised p-1.5 shadow-raised"
              >
                <div className="flex items-center justify-between px-2.5 py-2">
                  <p className="text-sm font-medium text-ink">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}
                      className="text-xs text-accent hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-surface-hover",
                        !n.read && "bg-accent-soft"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          n.read ? "bg-transparent" : "bg-accent"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{n.title}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">{n.description}</p>
                        <p className="mt-1 text-[11px] text-ink-faint">{timeAgo(n.at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-surface-hover"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent">
              {initials}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
          </button>

          <AnimatePresence>
            {userOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                className="glass absolute right-0 top-11 z-40 w-56 rounded-xl border border-border-strong bg-surface-raised p-1.5 shadow-raised"
              >
                <div className="px-2.5 py-2">
                  <p className="text-sm text-ink">{user.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-faint">
                    {user.email}
                    <Badge tone="accent" className="ml-1">
                      {user.role}
                    </Badge>
                  </p>
                </div>
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={() => {
                    setUserOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-muted hover:bg-surface-hover hover:text-ink"
                >
                  <Settings className="h-4 w-4 text-ink-faint" />
                  Settings
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-danger hover:bg-danger-soft disabled:opacity-50"
                >
                  {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
