"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Logomark } from "@/components/shell/logomark";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CheckState = "checking" | "needs-setup" | "ready" | "not-configured" | "error";

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
      </Card>
    </div>
  );
}
