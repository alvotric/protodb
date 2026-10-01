import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ProfileSection } from "@/components/settings/profile-section";
import { NotificationPreferencesSection } from "@/components/settings/notification-preferences";
import { DangerZoneSection } from "@/components/settings/danger-zone";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Phase 9 — Audit Logs & System Monitoring (Settings half), updated
 * in Phase 10: Profile is now the real signed-in user with a real
 * save (see profile-section.tsx). Notification preferences still
 * live in component state only -- wiring them to
 * `protodb_admin.notification_preferences` (already migrated) is
 * part of Phase 10's next continuation. No external alerting
 * integrations (Slack/PagerDuty) -- explicitly out of scope per the
 * roadmap.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Settings" user={user}>
      <div className="mb-4">
        <p className="text-sm text-ink-muted">Workspace and account settings.</p>
      </div>
      <div className="max-w-2xl space-y-4">
        <ProfileSection user={user} />
        <NotificationPreferencesSection />
        <DangerZoneSection />
      </div>
    </AppShell>
  );
}
