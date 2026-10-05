"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

function EndpointRow({ label, value, onCopy }: { label: string; value: string; onCopy: (text: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-36 shrink-0 text-xs text-ink-faint">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2.5 py-2 font-mono text-xs text-ink">
        {value}
      </code>
      <Button size="sm" variant="secondary" onClick={() => onCopy(value)} aria-label={`Copy ${label}`}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * App Integration: everything an external developer needs to connect
 * their app to this project's Auth. All values are live (derived from
 * the current origin + project slug); the example is copy-paste ready.
 */
export function AppIntegrationSection({ slug }: { slug: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function handleCopy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable; the values remain selectable manually.
    }
  }

  const base = origin || "{PROTODB_ORIGIN}";
  const authBase = `${base}/api/projects/${slug}/auth/v1`;
  const example = `import { createProtoDBClient } from "@protodb/auth-js";

const protodb = createProtoDBClient({
  url: "${base}",
  project: "${slug}",
});

await protodb.auth.signInWithGoogle();`;

  return (
    <Card className="px-4">
      <CardHeader>
        <div>
          <CardTitle>App Integration</CardTitle>
          <CardDescription>Connect an external app to this project&apos;s Auth.</CardDescription>
        </div>
        {copied && (
          <span role="status" className="flex items-center gap-1 text-xs text-success">
            <Check className="h-3.5 w-3.5" />Copied
          </span>
        )}
      </CardHeader>
      <div className="space-y-2 px-4 pb-2">
        <EndpointRow label="Project slug" value={slug} onCopy={(text) => void handleCopy(text, "slug")} />
        <EndpointRow label="Auth base URL" value={authBase} onCopy={(text) => void handleCopy(text, "base")} />
        <EndpointRow label="Authorize" value={`${authBase}/authorize`} onCopy={(text) => void handleCopy(text, "authorize")} />
        <EndpointRow label="Token" value={`${authBase}/token`} onCopy={(text) => void handleCopy(text, "token")} />
        <EndpointRow label="User" value={`${authBase}/user`} onCopy={(text) => void handleCopy(text, "user")} />
        <EndpointRow label="Logout" value={`${authBase}/logout`} onCopy={(text) => void handleCopy(text, "logout")} />
      </div>
      <div className="px-4 pb-2">
        <p className="mb-1.5 text-xs font-medium text-ink-muted">Install</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2.5 py-2 font-mono text-xs text-ink">
            npm install @protodb/auth-js
          </code>
          <Button size="sm" variant="secondary" onClick={() => void handleCopy("npm install @protodb/auth-js", "npm")} aria-label="Copy install command">
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-ink-muted">Example</p>
          <Button size="sm" variant="secondary" onClick={() => void handleCopy(example, "example")} aria-label="Copy example">
            <Copy className="h-3.5 w-3.5" />Copy example
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-5 text-ink-muted">
          {example}
        </pre>
        <div className="mt-2 space-y-1 text-[11px] text-ink-faint">
          <p><span className="font-medium text-ink-muted">A — Google Cloud → ProtoDB:</span> register the callback URL from the card above under Authorized redirect URIs in Google Cloud Console.</p>
          <p><span className="font-medium text-ink-muted">B — ProtoDB → your app:</span> register your app&apos;s redirect page in Allowed Redirect URLs above. ProtoDB sends the one-time code there.</p>
        </div>
      </div>
    </Card>
  );
}
