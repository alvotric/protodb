"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const LINK_ERRORS: Record<string, string> = {
  "cancelled": "Google authorization was cancelled.",
  "invalid-state": "The Google request could not be verified. Please try again.",
  "invalid-response": "Google returned an invalid response. Please try again.",
  "verification-failed": "Google identity verification failed. Please try again.",
  "unavailable": "Google linking is temporarily unavailable. Please try again.",
  "signin-required": "Your session expired. Sign in again, then retry.",
  "already-linked": "This Google account is already linked to an account.",
};

/**
 * Authenticated Google account linking. Binding a Google identity to the
 * signed-in account is the ONLY way an existing password account gains
 * Google login — the callback never merges accounts on email match
 * alone. Unlinking is intentionally not offered here; a linked identity
 * is a security-sensitive binding an Owner manages by other means.
 */
export function GoogleLinkSection() {
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("linked") === "google") setLinked(true);
    const linkError = params.get("link_error");
    if (linkError) setError(LINK_ERRORS[linkError] ?? "Google linking failed. Please try again.");
  }, []);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>Link Google to sign in with it next time. Password sign-in keeps working.</CardDescription>
        </div>
      </CardHeader>
      <div className="space-y-2 px-4 pb-4">
        {linked && (
          <p role="status" className="flex items-center gap-1.5 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Google is connected to this account.
          </p>
        )}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <Button
          size="sm"
          variant="secondary"
          disabled={linking}
          onClick={() => {
            setError(null);
            setLinking(true);
            window.location.href = "/api/auth/google?intent=link";
          }}
        >
          {linking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Connect Google
        </Button>
      </div>
    </Card>
  );
}
