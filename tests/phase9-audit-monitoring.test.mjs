import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_PAGE_SIZE_MAX,
  AUDIT_PAGE_SIZE_DEFAULT,
  AuditQueryError,
  buildAuditSql,
  canReadAudit,
  parseAuditQuery,
} from "../lib/audit/audit-query.ts";
import {
  buildNotificationPreferenceSelect,
  buildNotificationPreferenceUpsert,
  createDefaultNotificationPreferences,
  mapStoredNotificationPreferences,
  NotificationPreferenceValidationError,
  parseNotificationPreferenceUpdate,
} from "../lib/settings/notification-policy.ts";
import { createSystemHealthSnapshot } from "../lib/audit/health-policy.ts";
import { PROFILE_NAME_MAX_LENGTH, validateProfileName } from "../lib/settings/profile-policy.ts";
import { WORKSPACE_DELETION_AVAILABLE } from "../lib/settings/danger-zone-policy.ts";

test("audit filter builder maps each filter to database predicates and parameterized values", () => {
  const filters = parseAuditQuery(new URLSearchParams({
    actor: "alice",
    action: "schema.create",
    resource: "public.orders",
    result: "failed",
    from: "2026-10-01",
    to: "2026-10-03",
    search: "timeout",
    page: "2",
    pageSize: "50",
  }));
  const statements = buildAuditSql(filters);
  assert.match(statements.count.text, /protodb_admin\.audit_log/);
  assert.match(statements.count.text, /position\(lower\(\$1\) in lower\(actor\)\)/);
  assert.match(statements.count.text, /position\(lower\(\$2\) in lower\(action\)\)/);
  assert.match(statements.count.text, /position\(lower\(\$3\) in lower\(resource\)\)/);
  assert.match(statements.count.text, /result = \$4/);
  assert.match(statements.count.text, /at >= \$5::timestamptz/);
  assert.match(statements.count.text, /at < \$6::timestamptz/);
  assert.match(statements.count.text, /position\(lower\(\$7\) in lower\(concat_ws/);
  assert.deepEqual(statements.count.values, [
    "alice", "schema.create", "public.orders", "failed",
    "2026-10-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z", "timeout",
  ]);
  assert.match(statements.list.text, /order by at desc, id desc\s+limit \$8 offset \$9/);
  assert.deepEqual(statements.list.values.slice(-2), [50, 100]);
});

test("audit pagination defaults, maximum page size, and empty result query are bounded", () => {
  const filters = parseAuditQuery(new URLSearchParams());
  assert.equal(filters.page, 0);
  assert.equal(filters.pageSize, AUDIT_PAGE_SIZE_DEFAULT);
  assert.equal(AUDIT_PAGE_SIZE_MAX, 50);
  const statements = buildAuditSql(filters);
  assert.equal(statements.count.text, "select count(*)::text as total from protodb_admin.audit_log");
  assert.match(statements.list.text, /order by at desc, id desc/);
  assert.deepEqual(statements.list.values, [25, 0]);
  assert.throws(() => parseAuditQuery(new URLSearchParams("pageSize=51")), AuditQueryError);
  assert.throws(() => parseAuditQuery(new URLSearchParams("page=-1")), AuditQueryError);
  assert.throws(() => parseAuditQuery(new URLSearchParams("page=100001")), AuditQueryError);
});

test("audit filters reject unknown/duplicate fields, invalid results, malformed dates, and reversed ranges", () => {
  for (const query of [
    "sql=select",
    "actor=a&actor=b",
    "result=successfully",
    "from=not-a-date",
    "from=2026-02-31T09%3A00%3A00Z",
    "from=2026-10-02T25%3A00%3A00Z",
    "from=2026-10-03&to=2026-10-03",
    "search=" + "x".repeat(201),
  ]) {
    assert.throws(() => parseAuditQuery(new URLSearchParams(query)), AuditQueryError, query);
  }
});

test("audit reading policy is server-role scoped to Owner and Admin", () => {
  assert.equal(canReadAudit("Owner"), true);
  assert.equal(canReadAudit("Admin"), true);
  assert.equal(canReadAudit("Editor"), false);
  assert.equal(canReadAudit("Viewer"), false);
});

test("notification defaults and stored-row mapping use documented in-app/email defaults", () => {
  const defaults = createDefaultNotificationPreferences();
  assert.equal(defaults.length, 6);
  assert.ok(defaults.every((item) => item.inApp === true && item.email === false));
  const loaded = mapStoredNotificationPreferences([
    { event_id: "query_failed", in_app: false, email: true },
  ]);
  assert.deepEqual(
    loaded.find((item) => item.eventId === "query_failed"),
    { ...defaults[0], inApp: false, email: true }
  );
  assert.deepEqual(loaded.find((item) => item.eventId === "backup_completed"), defaults[1]);
});

test("notification preference API policy allow-lists events/channels and derives storage scope from user id", () => {
  const update = parseNotificationPreferenceUpdate({ eventId: "query_failed", channel: "email", enabled: true });
  assert.deepEqual(update, { eventId: "query_failed", channel: "email", enabled: true });
  assert.throws(
    () => parseNotificationPreferenceUpdate({ eventId: "unknown", channel: "email", enabled: true }),
    NotificationPreferenceValidationError
  );
  assert.throws(
    () => parseNotificationPreferenceUpdate({ eventId: "query_failed", channel: "sms", enabled: true }),
    NotificationPreferenceValidationError
  );
  assert.throws(
    () => parseNotificationPreferenceUpdate({ eventId: "query_failed", channel: "email", enabled: "true" }),
    NotificationPreferenceValidationError
  );
  assert.throws(
    () => parseNotificationPreferenceUpdate({ userId: "another-user", eventId: "query_failed", channel: "email", enabled: true }),
    NotificationPreferenceValidationError
  );

  const select = buildNotificationPreferenceSelect("session-user-1");
  assert.match(select.text, /where user_id = \$1/);
  assert.equal(select.values[0], "session-user-1");
  const upsert = buildNotificationPreferenceUpsert("session-user-1", update);
  assert.match(upsert.text, /on conflict \(user_id, event_id\) do update/);
  assert.deepEqual(upsert.values, ["session-user-1", "query_failed", "email", true]);
});

test("system health exposes only PostgreSQL snapshots and explicit unavailable history", () => {
  const snapshot = createSystemHealthSnapshot(
    { activeConnections: 4, maxConnections: 120 },
    new Date("2026-10-02T10:00:00Z")
  );
  assert.equal(snapshot.connections.active, 4);
  assert.equal(snapshot.connections.maximum, 120);
  assert.equal(snapshot.connections.source, "pg_stat_activity / pg_settings");
  assert.equal(snapshot.connections.temporalKind, "snapshot");
  assert.equal(snapshot.capturedAt, "2026-10-02T10:00:00.000Z");
  assert.equal(snapshot.historicalErrorRate.available, false);
  assert.equal(snapshot.slowQueryHistory.available, false);
  assert.equal(snapshot.connectionHistory.available, false);
  assert.throws(() => createSystemHealthSnapshot({ activeConnections: -1, maxConnections: 120 }, new Date()));
  assert.throws(() => createSystemHealthSnapshot({ activeConnections: 4, maxConnections: 0 }, new Date()));
});

test("profile validation is bounded and workspace deletion remains unavailable", () => {
  assert.deepEqual(validateProfileName("  Morgan Lee "), { ok: true, name: "Morgan Lee" });
  assert.equal(validateProfileName("   ").ok, false);
  assert.equal(validateProfileName("x".repeat(PROFILE_NAME_MAX_LENGTH + 1)).ok, false);
  assert.equal(WORKSPACE_DELETION_AVAILABLE, false);
});
