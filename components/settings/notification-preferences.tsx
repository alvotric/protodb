"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { notificationPreferences as seedPrefs, type NotificationPreference } from "@/lib/mock-data";

export function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<NotificationPreference[]>(seedPrefs);

  function toggle(id: string, channel: "inApp" | "email") {
    setPrefs((prev) => prev.map((p) => (p.id === id ? { ...p, [channel]: !p[channel] } : p)));
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose what you want to hear about, and where.</CardDescription>
        </div>
      </CardHeader>

      <div className="px-4 pb-4">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-1 border-b border-border pb-2">
          <span />
          <span className="text-xs font-medium text-ink-faint">In-app</span>
          <span className="text-xs font-medium text-ink-faint">Email</span>
        </div>
        {prefs.map((pref) => (
          <div key={pref.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-b border-border py-3 last:border-b-0">
            <div>
              <p className="text-sm text-ink">{pref.label}</p>
              <p className="text-xs text-ink-faint">{pref.description}</p>
            </div>
            <Switch checked={pref.inApp} onChange={() => toggle(pref.id, "inApp")} aria-label={`${pref.label} in-app`} />
            <Switch checked={pref.email} onChange={() => toggle(pref.id, "email")} aria-label={`${pref.label} email`} />
          </div>
        ))}
      </div>
    </Card>
  );
}
