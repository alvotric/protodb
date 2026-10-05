import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ProfileSection } from "@/components/settings/profile-section";
import { NotificationPreferencesSection } from "@/components/settings/notification-preferences";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { GoogleLinkSection } from "@/components/settings/google-link-section";
import { DangerZoneSection } from "@/components/settings/danger-zone";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Phase 9 account settings. Profile and notification preferences are
 * persisted for the authenticated user. Notification delivery and
 * workspace deletion are not implemented.
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
        <AppearanceSection />
        <GoogleLinkSection />
        <NotificationPreferencesSection />
        <DangerZoneSection />
      </div>
    </AppShell>
  );
}
