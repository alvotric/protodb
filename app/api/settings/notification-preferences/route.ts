import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import {
  NotificationPreferenceValidationError,
  parseNotificationPreferenceUpdate,
} from "@/lib/settings/notification-policy";
import {
  readNotificationPreferences,
  writeNotificationPreference,
} from "@/lib/settings/notification-service";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "database_unavailable", message: "Notification preferences are unavailable because no database is configured." } },
      { status: 503 }
    );
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: { code: "unauthenticated", message: "Not signed in." } }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, preferences: await readNotificationPreferences(user.id) });
  } catch (error) {
    console.error("Failed to read notification preferences:", error);
    return NextResponse.json(
      { ok: false, error: { code: "preferences_unavailable", message: "Notification preferences could not be loaded." } },
      { status: 503 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "database_unavailable", message: "Notification preferences are unavailable because no database is configured." } },
      { status: 503 }
    );
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: { code: "unauthenticated", message: "Not signed in." } }, { status: 401 });
  }

  let update;
  try {
    update = parseNotificationPreferenceUpdate(await request.json());
  } catch (error) {
    const message = error instanceof NotificationPreferenceValidationError
      ? error.message
      : "Request body must be valid JSON.";
    return NextResponse.json(
      { ok: false, error: { code: "invalid_request", message } },
      { status: 400 }
    );
  }

  try {
    const preference = await writeNotificationPreference(user.id, update);
    await logAuditEvent({
      actor: user.email,
      action: "settings.notification_preference.update",
      resource: `${update.eventId}.${update.channel}`,
      result: "success",
    });
    return NextResponse.json({ ok: true, preference });
  } catch (error) {
    await logAuditEvent({
      actor: user.email,
      action: "settings.notification_preference.update",
      resource: `${update.eventId}.${update.channel}`,
      result: "failed",
    });
    console.error("Failed to update notification preference:", error);
    return NextResponse.json(
      { ok: false, error: { code: "preference_save_failed", message: "Notification preference could not be saved." } },
      { status: 503 }
    );
  }
}
