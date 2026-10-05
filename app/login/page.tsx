"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Logomark } from "@/components/shell/logomark";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CheckState = "checking" | "needs-setup" | "ready" | "not-configured" | "error";

const OAUTH_MESSAGES: Record<string, string> = {
  "cancelled": "Google sign-in was cancelled. Try again when you're ready.",
  "invalid-state": "Google sign-in could not be verified. Please try again.",
  "invalid-response": "Google returned an invalid response. Please try again.",
  "verification-failed": "Google identity verification failed. Please try again.",
  "unavailable": "Google sign-in is temporarily unavailable. Use your password instead.",
  "suspended": "This account is unavailable.",
  "exists": "An account with this email already exists. Sign in with your password instead — you can connect Google from Settings.",
  "no-account": "No ProtoDB account is linked to this Google identity. Sign in with your password instead.",
  "signin-required": "Sign in first, then connect Google from Settings.",
};

/**
 * Phase 10 — Backend API & Real Data Integration.
 * Replaces every earlier phase's implicit "you're always signed in as
 * Amelia Cross" (lib/mock-data.ts's `currentUser`). Checks
 * `/api/auth/setup` on mount: a brand-new database has no users at
 * all, so this shows a one-time "create the first admin account" form
 * instead of a login form nobody could possibly satisfy yet.
 */
export default function LoginPage() {
  const router = useRouter();
  const [state, setState] = useState<CheckState>("checking");
  const [checkError, setCheckError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [googleRedirecting, setGoogleRedirecting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("oauth");
    if (code) setOauthError(OAUTH_MESSAGES[code] ?? "Google sign-in failed. Please try again.");
  }, []);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((res) => res.json())
      .then((data) => {
        if (!data.databaseConfigured) {
          setState("not-configured");
        } else if (data.error) {
          setCheckError(data.error);
          setState("error");
        } else {
          setState(data.needsSetup ? "needs-setup" : "ready");
        }
      })
      .catch(() => {
        setCheckError("Couldn't reach the server.");
        setState("error");
      });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const endpoint = state === "needs-setup" ? "/api/auth/setup" : "/api/auth/login";
    const body = state === "needs-setup" ? { name, email, password } : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setSubmitError(data.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setSubmitError("Couldn't reach the server.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2">
          <Logomark />
          <span className="text-sm font-semibold tracking-tight text-ink">ProtoDB</span>
        </div>

        {state === "checking" && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-ink-faint" />
          </div>
        )}

        {state === "not-configured" && (
          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <code className="rounded bg-black/20 px-1 py-0.5 text-xs">DATABASE_URL</code> isn&apos;t set yet. Add it (see
              .env.example), run the migration, then reload this page.
            </span>
          </div>
        )}

        {state === "error" && (
          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{checkError}</span>
          </div>
        )}

        {(state === "needs-setup" || state === "ready") && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <h1 className="text-lg font-medium text-ink">
                {state === "needs-setup" ? "Create your admin account" : "Sign in"}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {state === "needs-setup"
                  ? "This database has no users yet -- this account becomes the Owner."
                  : "Welcome back."}
              </p>
            </div>

            {state === "needs-setup" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amelia Cross" required />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-muted">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-muted">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={state === "needs-setup" ? "At least 8 characters" : "••••••••"}
                required
              />
            </div>

            {submitError && <p className="text-sm text-danger">{submitError}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {state === "needs-setup" ? "Create account & sign in" : "Sign in"}
            </Button>
          </form>
        )}

        {(state === "needs-setup" || state === "ready") && (
          <div className="mt-4">
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-ink-faint">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {oauthError && (
              <p role="alert" className="mt-3 text-sm text-danger">{oauthError}</p>
            )}
            <Button
              type="button"
              variant="secondary"
              className="mt-3 w-full"
              disabled={googleRedirecting}
              onClick={() => {
                setOauthError(null);
                setGoogleRedirecting(true);
                window.location.href = "/api/auth/google";
              }}
            >
              {googleRedirecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8-.1.1C3.5 21.4 7.5 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.5-2.7-.1.1C.6 8.7 0 10.2 0 12s.6 3.3 1.5 4.8l3.7-2.4z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.6 1.5 6.8l3.7 2.9c1-2.9 3.7-5 6.8-5z"
                  />
                </svg>
              )}
              Continue with Google
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
