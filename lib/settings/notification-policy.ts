export const NOTIFICATION_EVENTS = [
  { id: "query_failed", label: "A query fails", description: "A SQL Editor execution returns an error." },
  { id: "backup_completed", label: "Backup completes", description: "A configured backup finishes." },
  { id: "member_joined", label: "New team member joins", description: "A team invitation is accepted." },
  { id: "storage_limit", label: "Storage limit reached", description: "A bucket crosses its configured size limit." },
  { id: "rls_disabled", label: "RLS disabled on a table", description: "Row-level security is disabled on a table." },
  { id: "schedule_failed", label: "Scheduled trigger fails", description: "A configured scheduled workflow reports an error." },
] as const;

export type NotificationEventId = (typeof NOTIFICATION_EVENTS)[number]["id"];
export type NotificationChannel = "inApp" | "email";
export type NotificationPreference = {
  eventId: NotificationEventId;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
};

export type StoredNotificationPreference = {
  event_id: string;
  in_app: boolean;
  email: boolean;
};

export class NotificationPreferenceValidationError extends Error {}

export function buildNotificationPreferenceSelect(userId: string) {
  return {
    text: `select event_id, in_app, email
           from protodb_admin.notification_preferences
           where user_id = $1 and event_id = any($2::text[])`,
    values: [userId, NOTIFICATION_EVENTS.map((event) => event.id)],
  };
}

export function createDefaultNotificationPreferences(): NotificationPreference[] {
  return NOTIFICATION_EVENTS.map((event) => ({
    ...event,
    eventId: event.id,
    inApp: true,
    email: false,
  }));
}

export function mapStoredNotificationPreferences(
  rows: readonly StoredNotificationPreference[]
): NotificationPreference[] {
  const stored = new Map(rows.map((row) => [row.event_id, row]));
  return createDefaultNotificationPreferences().map((preference) => {
    const row = stored.get(preference.eventId);
    return row ? { ...preference, inApp: row.in_app, email: row.email } : preference;
  });
}

export function parseNotificationPreferenceUpdate(value: unknown): {
  eventId: NotificationEventId;
  channel: NotificationChannel;
  enabled: boolean;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NotificationPreferenceValidationError("A JSON object is required.");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["eventId", "channel", "enabled"].includes(key))) {
    throw new NotificationPreferenceValidationError("Only eventId, channel, and enabled are accepted.");
  }
  if (typeof body.eventId !== "string" || !NOTIFICATION_EVENTS.some((event) => event.id === body.eventId)) {
    throw new NotificationPreferenceValidationError("eventId is not a supported notification event.");
  }
  if (body.channel !== "inApp" && body.channel !== "email") {
    throw new NotificationPreferenceValidationError('channel must be "inApp" or "email".');
  }
  if (typeof body.enabled !== "boolean") {
    throw new NotificationPreferenceValidationError("enabled must be a boolean.");
  }
  return { eventId: body.eventId as NotificationEventId, channel: body.channel, enabled: body.enabled };
}

export function buildNotificationPreferenceUpsert(userId: string, update: {
  eventId: NotificationEventId;
  channel: NotificationChannel;
  enabled: boolean;
}) {
  return {
    text: `insert into protodb_admin.notification_preferences as current
             (user_id, event_id, in_app, email)
           values (
             $1, $2,
             case when $3::text = 'inApp' then $4::boolean else true end,
             case when $3::text = 'email' then $4::boolean else false end
           )
           on conflict (user_id, event_id) do update set
             in_app = case when $3::text = 'inApp' then excluded.in_app else current.in_app end,
             email = case when $3::text = 'email' then excluded.email else current.email end
           returning event_id, in_app, email`,
    values: [userId, update.eventId, update.channel, update.enabled],
  };
}
