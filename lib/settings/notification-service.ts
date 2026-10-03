import { query, queryOne } from "@/lib/db/client";
import {
  buildNotificationPreferenceUpsert,
  buildNotificationPreferenceSelect,
  mapStoredNotificationPreferences,
  type NotificationChannel,
  type NotificationEventId,
  type NotificationPreference,
  type StoredNotificationPreference,
} from "@/lib/settings/notification-policy";

export async function readNotificationPreferences(userId: string): Promise<NotificationPreference[]> {
  const statement = buildNotificationPreferenceSelect(userId);
  const rows = await query<StoredNotificationPreference>(statement.text, statement.values);
  return mapStoredNotificationPreferences(rows);
}

export async function writeNotificationPreference(userId: string, update: {
  eventId: NotificationEventId;
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<NotificationPreference> {
  const statement = buildNotificationPreferenceUpsert(userId, update);
  const row = await queryOne<StoredNotificationPreference>(statement.text, statement.values);
  if (!row) throw new Error("Notification preference update returned no row.");
  const preference = mapStoredNotificationPreferences([row]).find((item) => item.eventId === row.event_id);
  if (!preference) throw new Error("Notification preference update returned an unsupported event.");
  return preference;
}
