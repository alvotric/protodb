"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { NotificationChannel, NotificationPreference } from "@/lib/settings/notification-policy";

function isPreference(value: unknown): value is NotificationPreference {
  if (!value || typeof value !== "object") return false;
  const preference = value as Record<string, unknown>;
  return typeof preference.eventId === "string" &&
    typeof preference.label === "string" &&
    typeof preference.description === "string" &&
    typeof preference.inApp === "boolean" &&
    typeof preference.email === "boolean";
}

function responseError(value: unknown): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
  }
  return "Notification preferences could not be loaded.";
}

export function NotificationPreferencesSection() {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const loadPreferences = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/settings/notification-preferences", { signal, cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(body));
      if (!body || typeof body !== "object" || !("ok" in body) ||
          (body as { ok?: unknown }).ok !== true || !("preferences" in body) ||
          !Array.isArray((body as { preferences?: unknown }).preferences) ||
          !(body as { preferences: unknown[] }).preferences.every(isPreference)) {
        throw new Error("The notification preference API returned invalid data.");
      }
      setPreferences((body as { preferences: NotificationPreference[] }).preferences);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setLoadError(cause instanceof Error ? cause.message : "Notification preferences could not be loaded.");
      setPreferences([]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPreferences(controller.signal);
    return () => controller.abort();
  }, [loadPreferences, retry]);

  async function toggle(eventId: string, channel: NotificationChannel, enabled: boolean) {
    const key = `${eventId}:${channel}`;
    setSavingKey(key);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const response = await fetch("/api/settings/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, channel, enabled }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(body));
      const preference = body && typeof body === "object" && "preference" in body
        ? (body as { preference?: unknown }).preference
        : null;
      if (!isPreference(preference)) throw new Error("The saved preference response was invalid.");
      setPreferences((current) => current.map((item) => item.eventId === preference.eventId ? preference : item));
      setSavedMessage("Preference saved to your account.");
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Notification preference could not be saved.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Preferences are saved for your signed-in account. Delivery channels are not connected by this setting.</CardDescription>
        </div>
      </CardHeader>

      {loading ? (
        <div role="status" aria-label="Loading notification preferences" className="space-y-2 px-4 pb-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : loadError ? (
        <div className="px-4 pb-4">
          <ErrorState title="Preferences unavailable" description={loadError} action={<Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button>} />
        </div>
      ) : (
        <div className="px-4 pb-4">
          <p className="mb-3 text-xs text-ink-faint">Missing database rows use defaults: in-app on, email off. Enabling a channel records the preference only; notification delivery is not implemented here.</p>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-1 border-b border-border pb-2">
            <span />
            <span className="text-xs font-medium text-ink-faint">In-app</span>
            <span className="text-xs font-medium text-ink-faint">Email</span>
          </div>
          {preferences.length === 0 ? (
            <p className="py-4 text-sm text-ink-muted">No notification preferences are configured.</p>
          ) : preferences.map((preference) => {
            return (
              <div key={preference.eventId} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-b border-border py-3 last:border-b-0">
                <div>
                  <p className="text-sm text-ink">{preference.label}</p>
                  <p className="text-xs text-ink-faint">{preference.description}</p>
                </div>
                <Switch
                  checked={preference.inApp}
                  disabled={savingKey !== null}
                  onChange={(enabled) => void toggle(preference.eventId, "inApp", enabled)}
                  aria-label={`${preference.label} in-app`}
                />
                <Switch
                  checked={preference.email}
                  disabled={savingKey !== null}
                  onChange={(enabled) => void toggle(preference.eventId, "email", enabled)}
                  aria-label={`${preference.label} email`}
                />
              </div>
            );
          })}
          {saveError && <p role="alert" className="mt-3 text-xs text-danger">{saveError}</p>}
          {savedMessage && <p role="status" aria-live="polite" className="mt-3 text-xs text-success">{savedMessage}</p>}
        </div>
      )}
    </Card>
  );
}
