"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

export interface GoogleProviderState {
  configured: boolean;
  enabled: boolean;
  client_id: string | null;
  allowed_redirect_urls: string[];
}

function apiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
  }
  return fallback;
}

export function ProjectAuthSection({ projectId, slug }: { projectId: string; slug: string }) {
  const [provider, setProvider] = useState<GoogleProviderState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectInput, setRedirectInput] = useState("");
  const [redirectUrls, setRedirectUrls] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");

  useEffect(() => {
    setCallbackUrl(`${window.location.origin}/api/projects/${slug}/auth/v1/callback`);
  }, [slug]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/providers`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(apiError(payload, "Google provider could not be loaded."));
        if (!payload || typeof payload !== "object" || !("google" in payload)) {
          throw new Error("The provider API returned invalid data.");
        }
        return (payload as { google: GoogleProviderState }).google;
      })
      .then((state) => {
        if (controller.signal.aborted) return;
        setProvider(state);
        setClientId(state.client_id ?? "");
        setRedirectUrls(state.allowed_redirect_urls);
        setEnabled(state.enabled);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Google provider could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, retry]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          ...(clientSecret ? { clientSecret } : {}),
          redirectUrls,
          enabled,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Google provider could not be saved."));
      const state = (payload as { google: GoogleProviderState }).google;
      setProvider((previous) => ({ ...(previous ?? { configured: true, client_id: null, allowed_redirect_urls: [] }), ...state }));
      setClientSecret("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Google provider could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setSaveError("Copy failed — select the URL manually.");
    }
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading Google provider" className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <ErrorState
        title="Google provider unavailable"
        description={error ?? "Google provider could not be loaded."}
        action={<Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="px-4">
        <CardHeader>
          <div>
            <CardTitle>Google provider</CardTitle>
            <CardDescription>Per-project OAuth client. External apps sign in through this project only.</CardDescription>
          </div>
          <Badge tone={provider.enabled ? "success" : "neutral"} dot>
            {provider.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </CardHeader>
        <div className="space-y-4 px-4 pb-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-3">
            <div>
              <p className="text-sm text-ink">Enable Google sign-in</p>
              <p className="text-xs text-ink-faint">Disabled projects reject authorize requests.</p>
            </div>
            <Switch checked={enabled} onChange={setEnabled} aria-label="Enable Google sign-in" disabled={saving} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted" htmlFor="google-client-id">Google Client ID</label>
            <Input
              id="google-client-id"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
              mono
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted" htmlFor="google-client-secret">Google Client Secret</label>
            <Input
              id="google-client-secret"
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder={provider.configured ? "Leave blank to keep the existing secret" : "Required on first setup"}
              mono
            />
            <p className="mt-1 text-[11px] text-ink-faint">Write-only. Encrypted at rest immediately; never displayed.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">Allowed redirect URLs</label>
            {redirectUrls.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {redirectUrls.map((url) => (
                  <li key={url} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{url}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${url}`}
                      onClick={() => setRedirectUrls((previous) => previous.filter((entry) => entry !== url))}
                      className="shrink-0 text-xs text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={redirectInput}
                onChange={(event) => setRedirectInput(event.target.value)}
                placeholder="https://app.example.com/auth/callback"
                mono
                aria-label="New redirect URL"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const url = redirectInput.trim();
                  if (url && !redirectUrls.includes(url)) setRedirectUrls((previous) => [...previous, url]);
                  setRedirectInput("");
                }}
              >
                Add
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">Exact match at runtime. HTTPS only, except loopback HTTP for local development.</p>
          </div>

          {saveError && <p role="alert" className="text-xs text-danger">{saveError}</p>}
          <div className="flex items-center justify-end gap-2">
            {saved && (
              <span role="status" className="flex items-center gap-1 text-xs text-success">
                <Check className="h-3.5 w-3.5" />Saved
              </span>
            )}
            <Button size="sm" onClick={() => void handleSave()} loading={saving} disabled={!clientId.trim()}>
              Save provider
            </Button>
          </div>
        </div>
      </Card>

      <Card className="px-4">
        <CardHeader>
          <div>
            <CardTitle>ProtoDB callback URL</CardTitle>
            <CardDescription>Register exactly this URL under Authorized redirect URIs in Google Cloud Console.</CardDescription>
          </div>
        </CardHeader>
        <div className="flex items-center gap-2 px-4 pb-4">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2.5 py-2 font-mono text-xs text-ink">
            {callbackUrl || "Loading…"}
          </code>
          <Button size="sm" variant="secondary" onClick={() => void handleCopy(callbackUrl)} disabled={!callbackUrl}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Card>

      {saving && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-ink-faint">
          <Loader2 className="h-3 w-3 animate-spin" />Saving…
        </p>
      )}
    </div>
  );
}
