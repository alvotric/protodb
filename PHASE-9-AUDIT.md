# Phase 9 — Audit Logs & System Monitoring Deep Audit

## Scope and Evidence

- Audited repository baseline: `77d8b19e85bcd42d86b901bee23c1637a5e074c1` (Phase 8), with Phase 7 baseline `c093b33261501b04998947cc743d462a44095753` and Phase 6 baseline `1ea1ef0b62b93829a1b74a059a335ae59ca4d8e9` in history.
- `ROADMAP.md` is present and is the only locally available roadmap specification. The official `ProtoDB-Admin-Roadmap.pdf` and a separate Phase 1–9 Gap & Repair Report were not found in the repository root/files inspected. Findings therefore do not assume requirements beyond the checked-in roadmap and this audit request.
- Inspected the audit, dashboard and settings pages/components; all tracked API routes; audit logger and database clients; migrations; mock fixtures; auth/session/role guards; query history/execution paths; README, `.env.example`, package scripts and tests.
- `.env.local` was not opened or inspected. No database, credentials, storage provider, or external service was contacted. No application file, migration, database, permission, storage object, or secret was changed. This file is the only requested output.
- Status terms are exactly those requested: **Implemented**, **Partially implemented**, **Missing**, **Mocked**, **Incorrect/Misleading**. Severity is **Critical**, **High**, **Medium**, or **Low** and describes the engineering/security/data-integrity impact, not a numeric score.

## Overall Status

Phase 9 is **mixed and materially incomplete as an operational audit/monitoring experience**. The application has real persisted audit-write paths for several auth, table, schema, SQL, and Storage operations; it also has a real self-scoped profile update and a live Dashboard database snapshot. However, `/audit` does not retrieve those audit records: it renders fixture events. Its system-health panel displays fabricated connection/error history and fabricated slow-query rows. Notification switches only change local component state. The danger-zone action is a preview, not a deletion.

The clearest risks are the unlabeled demo-versus-live boundary on `/audit` and its monitoring panel, best-effort audit writes that can be lost while the underlying mutation succeeds, and incomplete event coverage. The database schema has no audit retention policy or filter indexes beyond timestamp. The available roadmap explicitly allows mock data through Phase 9 and places API/data integration for pages 2–9 in Phase 10; therefore live audit retrieval, preference persistence and historical telemetry must not be silently treated as existing Phase 9 features. README claims that Phase 9 is a “real deliverable” and that each page labels its data source conflict with the actual `/audit` and `/settings` behavior and with the roadmap’s Phase 10 boundary.

## Requirement-by-Requirement Audit

| Phase 9 requirement | Status | Current implementation and concrete gap | Severity / boundary |
|---|---|---|---|
| Searchable/filterable audit trail | **Mocked** | `components/audit/audit-log-table.tsx` filters the hard-coded `auditLog` fixture in browser memory. It has a working free-text search across actor/action/resource and a local success/failed toggle, but no API or query to `protodb_admin.audit_log`. | **High** correctness risk: live-looking records are not the persisted audit trail. Real retrieval is explicitly listed as pending Phase 10 in `ROADMAP.md`. |
| Actor, action, and resource filters | **Mocked** | Only one free-text input searches those three fixture fields; there are no dedicated filters and no filter reaches a server or real audit rows. | **Medium**: local interactions do not establish that actor/action/resource filtering works against stored records. Phase 9 can keep clearly labeled demo filtering; live filters depend on Phase 10 retrieval. |
| Result/status filter | **Mocked** | “All / success / failed” filters fixture rows locally. Stored `result` values are not queried. | **Medium**; live status filtering depends on Phase 10. |
| Time/date-range filter | **Missing** | No date inputs, range state, request parameters, or time predicate. The table renders relative `timeAgo()` values for fixture timestamps only. | **Medium**; adding presentation-level demo controls can remain a Phase 9 prototype; filtering persisted history depends on Phase 10. |
| Audit pagination and safe large-result handling | **Missing** | The UI has no pagination or page-size control; its fixture currently contains 15 entries. There is no audit retrieval API to bound. | **Medium** for future real, unbounded logs. Add bounded server-side pagination with deterministic ordering when the Phase 10 read API is authorized. |
| Persisted audit event creation | **Partially implemented** | `migrations/001_protodb_admin_schema.sql` creates `protodb_admin.audit_log`; `lib/audit/log.ts::logAuditEvent` inserts parameterized values. Auth setup/login also insert directly. Several mutation routes call the helper, but coverage is incomplete and helper writes are best-effort. | **High** audit-integrity gap where successful mutations have no durable event if logging fails. |
| Connection pool monitoring | **Incorrect/Misleading** | `components/audit/system-health-panel.tsx::SystemHealthPanel` calls a card “Connection pool” but displays `dbHealth.activeConnections/maxConnections` and a static `connectionPoolSeries` from `lib/mock-data.ts`. Neither value describes the Node `pg.Pool` state. | **High** operational correctness: it can be read as live pool telemetry when it is fabricated. |
| Current active/max database connections | **Partially implemented** | `lib/dashboard/stats-service.ts::getDashboardStats` reads `pg_stat_activity` for `current_database()` and `pg_settings.max_connections`; `/dashboard` displays these on a request-time snapshot. This is server/database-wide activity and the database max, not this app process’s pool occupancy/capacity. No periodic refresh exists. | **Medium**: real snapshot exists elsewhere but does not implement the System Health pool panel. Reuse/rename only if scope and semantics are explicit. |
| Idle/waiting clients, pool utilization, connection health | **Missing** | `lib/db/client.ts::getPool` configures a `pg.Pool` with `max: 10` and idle/connection timeouts, and registers a console error handler. No code reads `totalCount`, `idleCount`, `waitingCount`, computes pool utilization, or presents pool health. | **Medium**; monitoring process-local pool state needs a server-side source/API and clear multi-instance semantics. |
| Connection history/series | **Mocked** | `connectionPoolSeries` and Dashboard `connectionsSeries` are literal arrays in `lib/mock-data.ts`, shown as sparklines without timestamps or persisted samples. | **High** if interpreted as actual trend data. No historical connection measurements exist. |
| Slow-query log | **Mocked** | `SystemHealthPanel` renders the four fixed `slowQueryLog` fixture rows with SQL text, duration and relative timestamps. No source query/service is called. | **High** if interpreted as actual slow queries. |
| Error rate over time | **Mocked** | The panel renders 14 fixed `errorRateSeries` values; latest `0.3` is formatted as `0.3%`. There is no event source, numerator, denominator, named interval, aggregation, or sampling schedule. | **High**: the green icon/line for values at or below 1% can suggest a healthy live service despite no measurement. |
| Notification preferences | **Mocked** | `components/settings/notification-preferences.tsx` seeds React state from `lib/mock-data.ts::notificationPreferences`; switches only update that local array. No read/write API or database call exists. | **Medium**: switches have no explicit local-only or unsaved label and can imply persisted settings. Persistence is part of Phase 10 integration under the checked-in roadmap boundary. |
| Account profile | **Implemented** for name save; **Partially implemented** as a complete account-settings area | `/settings` passes the authenticated `SessionUser`; `ProfileSection` PATCHes `/api/auth/profile`, which updates the current user’s name using `user.id` and a parameterized query. Email and role are read-only. The saved indicator follows API success and `router.refresh()`. | **Low** for the implemented field; no name length bound, mutation audit event, or server-side DB error normalization. Broader settings requirements need explicit scope. |
| Workspace/account settings page | **Partially implemented** | `app/settings/page.tsx` includes profile, local notification switches, and a preview danger zone. There are no persistent workspace settings, password-change/security settings, connected-account flows, or account deletion action. | **Medium** for misleading local preferences; absent items beyond the roadmap’s named profile/preferences/danger-zone scope should not be invented as Phase 9 requirements. |
| Danger zone / workspace deletion | **Mocked** | `DangerZoneSection` opens a confirmation dialog then sets local `deleted` state. It has no server endpoint/action and deletes nothing. Dialog and after-state disclose the preview, but the row text claims it removes every table, bucket, and team member permanently. There is no typed confirmation. | **Medium** misleading/destructive-intent copy; no present data-integrity effect because there is no backend. Any real deletion would require separate Phase 10 architecture, server-side authorization, strongly scoped confirmation, audit and partial-failure design. |
| Loading, empty, error, retry, and unavailable states | **Partially implemented** | Search with no matches uses `EmptyState`; profile save has saving/error/success UI. Audit and system health have no fetch/loading/error/unavailable behavior because they use synchronous fixtures. Notification controls have no save/error state; the slow-query table has no empty state. | **Medium**: current fixed demo state hides outage/unavailable versus empty-data distinctions. |

## What Is Genuinely Live/Persisted

### Audit storage and writers

`migrations/001_protodb_admin_schema.sql` creates `protodb_admin.audit_log` with:

- identity `id` primary key;
- required text `actor`, `action`, `resource`;
- constrained `result` (`success`/`failed`);
- optional text `ip`;
- database-generated `at timestamptz default now()`;
- only one explicit index: `audit_log_at_idx (at desc)`.

`lib/audit/log.ts::logAuditEvent` inserts `(actor, action, resource, result, ip)` through parameterized placeholders and relies on the database timestamp. It catches all insert errors, logs one message to server console, and resolves rather than failing the originating mutation. There is no audit read service or API in the tracked `app/api` routes, and no audit route query references `audit_log`.

Real event coverage observed:

- **Auth:** `app/api/auth/login/route.ts` directly inserts failed events for unknown email/bad password and success events for valid credentials. Suspended-account rejection is not logged; malformed/missing fields and some database/session failures are not logged. `app/api/auth/setup/route.ts` directly logs successful initial setup only. Logout (`app/api/auth/logout/route.ts`), session creation/destruction (`lib/auth/session.ts`), and profile update (`app/api/auth/profile/route.ts`) do not write audit events.
- **Table data:** `app/api/database/tables/[schema]/[table]/rows/route.ts` logs successful and caught failed row update/insert/delete operations and role-denied mutations. Read operations, malformed payloads, table-not-found exits, unauthenticated requests, and several early validation failures do not create entries.
- **Schema/DDL:** create/drop table; add/drop column; column changes; primary-key changes; and foreign-key create/edit/drop routes call `logAuditEvent` on service success/failure. Role-denied DDL and input/configuration failures that return before the service call are generally not logged. The concrete route set is `app/api/database/tables/route.ts`, `app/api/database/tables/[schema]/[table]/route.ts`, `app/api/database/tables/[schema]/[table]/columns/route.ts`, `app/api/database/tables/[schema]/[table]/columns/[column]/route.ts`, `app/api/database/tables/[schema]/[table]/primary-key/route.ts`, and `app/api/database/foreign-keys/route.ts`.
- **SQL execution:** `app/api/queries/execute/route.ts` logs role-denied executions and service outcomes with duration in the resource string. Invalid request bodies, concurrency rejection, and pre-execution configuration/authentication exits are not logged. SQL text is not placed in this audit row; the separate Phase 6 `query_history` table stores SQL text, status, duration and error fields per user, pruned to the latest 100 rows per user by the execution route.
- **Storage:** bucket creation/settings, object rename/delete/bulk-delete, upload finalization, and upload cancellation have helper calls, including several denied/failure paths. Successful upload initiation is not logged; failed initiation is. Reads/downloads/previews are not logged. Bulk delete can record a summary count and failed count rather than one durable row per object.

No reliable end-to-end duplicate event was established from source inspection: routes normally call one helper/direct insert for a given outcome. However, there is no idempotency key or uniqueness constraint to suppress duplicate retries. The schema has no retention policy, partitioning, actor/action/resource/result indexes, actor foreign key, or structured event metadata. `actor` is stored as text, not a stable user ID; this permits logging unknown login identities but weakens durable identity linkage.

### Other live Phase 9-adjacent data

- `lib/dashboard/stats-service.ts::getDashboardStats` queries real current PostgreSQL values for Dashboard cache-hit ratio, current-database `pg_stat_activity` row count, server `max_connections`, database size, and public base-table count. This is request-time state, not a time series and not the Node pool. `/api/dashboard/stats` is also present but the Dashboard Server Component calls the service directly.
- `app/api/auth/profile/route.ts::PATCH` updates only the authenticated user’s name (`where id = $2`, with values parameterized). The profile panel shows session-derived email and role as disabled fields.
- `migrations/002_sql_editor_history.sql` and the Phase 6 execute/history APIs persist recent SQL Editor executions per authenticated user. This is not a global PostgreSQL slow-query log and the Phase 9 panel does not read it.

No Phase 9 browser or database runtime checks were performed; the existence of these schema/writer paths is static repository evidence, not proof that a configured database contains the migration or current rows.

## What Is Mock/Demo/Static

- `components/audit/audit-log-table.tsx` imports `auditLog` from `lib/mock-data.ts`, containing 15 fixed rows and September 2026 timestamps/IPs/actors. A real authenticated page can therefore present fictional activity as if it were history. Search and result filters are local-only. There is no live/demo badge, source message, error state, loading state, server filter, date filter, sort or pagination.
- `components/audit/system-health-panel.tsx` imports `dbHealth`, `connectionPoolSeries`, `errorRateSeries`, and `slowQueryLog` from `lib/mock-data.ts`. The UI has no source/period labels. All four slow-query rows are fixed examples; the SQL strings are not obtained from PostgreSQL or query history.
- `lib/mock-data.ts` values are constants: `dbHealth` says 24 active / 100 max, `connectionPoolSeries` and `errorRateSeries` each contain 14 values, and `slowQueryLog` contains four fixed statements (18.24s, 4.21s, 3.87s, and 2.14s). No refresh or timestamps per series point are represented.
- `components/settings/notification-preferences.tsx` uses a cloned fixture array in component state. The UI gives no indication that changes disappear on reload.
- `components/settings/danger-zone.tsx` is a local preview. Confirmation only changes `deleted` state; the post-confirmation text discloses nothing was deleted, but the unqualified row copy overstates the effect.
- `README.md` says `/audit` is a “real deliverable” and `/settings` is a Phase 9 “real deliverable”; later it claims each page labels source/behavior. This is false for audit and notification/monitoring content.

## Monitoring Source Inventory

| Metric / display | Exact source and code | Status; snapshot/history | Refresh, authorization and limitations |
|---|---|---|---|
| System Health “Connection pool” number `24 / 100` | `components/audit/system-health-panel.tsx::SystemHealthPanel` reads `dbHealth.activeConnections/maxConnections` from `lib/mock-data.ts`. | **Mocked**; a static constant, neither current nor historical telemetry. | No refresh or error/unavailable state. `/audit` page requires a signed-in session via `app/audit/page.tsx`; all signed-in roles see the same fixtures. |
| System Health connection sparkline | Same component reads `connectionPoolSeries` from `lib/mock-data.ts`. | **Mocked**; 14 static values with no persisted timestamps or defined collection interval. | No refresh, authorization beyond page sign-in, or history storage. |
| Dashboard “Active connections” number | `lib/dashboard/stats-service.ts::getDashboardStats`: `select count(*) from pg_stat_activity where datname = current_database()`. `app/dashboard/page.tsx` calls it on server render; `/api/dashboard/stats` exposes same service. | **Live current snapshot** of database sessions visible in the database view, not app pool occupancy or historical count. | Refresh is a new request/page render; no polling. Dashboard page and stats API require `getCurrentUser()`; no role-specific monitoring guard. Actual catalog visibility and database configuration were not runtime-checked. |
| Dashboard maximum connections | Same service: `pg_settings` setting `max_connections`. | **Live current configuration snapshot**, database-wide max, not pool max. | Same refresh/auth behavior. No history and no calculation of utilization/waiting clients. |
| Node `pg.Pool` capacity/state | `lib/db/client.ts::getPool` configures `max: 10`, idle timeout 30s and connection timeout 8s. Its idle `error` handler writes server console errors. No UI/service reads pool counters. | Capacity configuration exists; current total/idle/waiting/health metric is **Unavailable** from the Phase 9 UI. | Process-local, potentially differs across instances. No metrics endpoint, sampling, history, or health status. |
| System Health error-rate number and sparkline | `components/audit/system-health-panel.tsx` reads `errorRateSeries` from `lib/mock-data.ts`; last fixture value is formatted with `toFixed(1)`. | **Mocked**; 14 hard-coded values. No defined time window, numerator, denominator, or event source. | No refresh. A value `<= 1` receives success coloring; it measures no real health and must not be presented as zero/healthy evidence. |
| Slow-query rows | Same component reads `slowQueryLog` from `lib/mock-data.ts`. | **Mocked**; fixed query text/duration/time values. | No PostgreSQL source, filter, refresh, permission-aware data access, or unavailable state. Query text would need sensitivity controls if a future live source is used. |
| Phase 6 execution history (possible limited source, not used by Phase 9) | `migrations/002_sql_editor_history.sql`, `/api/queries/execute`, `/api/queries/history`, `lib/queries/query-service.ts`. Stores SQL text, result status, elapsed ms and error for SQL Editor runs, scoped to `user_id`, with latest 100 per user. | **Live persisted per-user execution records**, not all PostgreSQL statements, not only slow statements, and not used by System Health. | History is fetched on query workspace load, not periodic telemetry. SQL text may be sensitive. It cannot by itself substantiate system-wide query health/error rate. |
| Dashboard cache-hit ratio (adjacent live metric) | `getDashboardStats` aggregates `pg_stat_database.blks_hit/blks_read`, returns one rounded ratio. | **Live current cumulative-counter ratio**, not a time series. | Request-time only. Null/falsey ratio falls back to `0`, conflating unavailable/empty counters with an actual zero ratio. Not the Phase 9 error rate. |

No query uses `pg_stat_statements`, PostgreSQL log tables, server log shipping, a metrics service, or a persisted sampling table for Phase 9. `.env.example` defines database and Storage settings only; it documents no telemetry source, collection interval, log retention, `pg_stat_statements` configuration, or notification delivery provider.

## Security & Authorization Findings

1. **Audit UI currently exposes only fixtures, but there is no live-audit read authorization design (High, future live integration).** `app/audit/page.tsx` requires `getCurrentUser()` and redirects unauthenticated users; it does not restrict role. The current table has no real data connection, so this is not a present exposure of `audit_log`. If live retrieval is added, every signed-in user would otherwise have access to a global log containing actor emails, IP addresses, and operation metadata. Existing Phase 8 `ROLE_CAPABILITIES` has no audit-read capability or per-resource audit policy. Decide and enforce access server-side before Phase 10 connects live records.
2. **Best-effort event persistence can silently leave successful writes unaudited (High).** `lib/audit/log.ts` intentionally catches database errors so mutation success does not depend on audit availability. The only failure evidence is `console.error`, which is not durable or exposed to an operator in the audit UI. There is no outbox/transactional coupling, retry, or health indicator for dropped audit writes.
3. **Event coverage is incomplete (Medium).** See the event inventory above: logout, profile update, suspended-login attempts, several auth failures, validation/configuration exits, reads, and some denied schema actions are absent. Therefore existing audit rows cannot be treated as a complete activity or security log.
4. **Audit identity/integrity is limited (Medium).** `audit_log.actor` is an email/text value rather than a foreign key or stable actor ID; IP comes from request `x-forwarded-for` in several routes without an in-repository trusted-proxy normalization layer. The audit table has no append-only enforcement, retention or immutable export. `app/api/queries/execute/route.ts` runs one arbitrary SQL statement for Owner/Admin through the shared DB pool; whether those credentials can alter `protodb_admin.audit_log` depends on actual database grants, which were not inspected. This creates a potential tamper path that must be evaluated when a live audit feed is scoped.
5. **Monitoring API exposes raw database errors (Medium).** `/api/dashboard/stats` catches query errors but returns `err.message` in the response; `app/dashboard/page.tsx` also renders caught exception text. Errors can contain schema/host/query details. The route is authenticated and has no dynamic input, but error detail is still broader than a safe user-facing status.
6. **Profile mutation is authenticated and self-scoped, but validation/logging are limited (Low).** `/api/auth/profile::PATCH` derives `user.id` from `getCurrentUser()` and parameterizes the update; the client cannot select another account. It checks only a non-empty trimmed name, with no explicit length bound or audit event. Database exceptions are not mapped to a structured safe response in this route.
7. **Danger-zone client confirmation is not authorization (Medium if made live; currently preview-only).** There is no server operation to bypass today. A future deletion must not rely on this `ConfirmDialog`; authentication, explicit administrative authorization, typed/target confirmation, safe scope, audit outcome, and partial-failure handling must be enforced server-side.
8. **Notification state has no security boundary (Low now; future persistence blocker).** It is browser-local and has no API. A future preference endpoint must derive its user ID from the session and validate event/channel values rather than accepting a client-selected user.
9. **No current Phase 9 API accepts audit filters.** The only Phase 9-related data API is `/api/dashboard/stats::GET`, which checks configured database and authenticated session; it accepts no user-supplied identifiers or query parameters. Profile PATCH’s only SQL values are parameterized. No audit/settings/danger endpoint exists to validate or secure.

## Loading/Empty/Error/Unavailable Findings

- **Audit trail:** immediate fixture render, no request/loading/error/retry/unavailable state. A no-match `EmptyState` means “this fixture search returned none,” not “the live audit table is empty.” There is no “no audit events” state tied to a database.
- **System health:** immediate fixture render. There is no way to distinguish zero, stale history, unavailable database metrics, missing stats privileges, or failed telemetry collection. Empty `slowQueryLog` would render an empty table body without explanation.
- **Dashboard live stats:** `DashboardPage` presents a visible load error and disconnected/not-configured state. When query throws, it inserts `err.message` into display and suggests migration 001. `getDashboardStats` converts null/falsey cache ratio to zero, potentially presenting unavailable as a numeric metric. There is no retry button or auto-refresh.
- **Notification preferences:** immediate seeded values and interactive switches, with no loading/saving/error/empty state or persistence notice. Missing database rows cannot be distinguished because no rows are fetched.
- **Profile:** shows saving indicator, API error, and transient saved confirmation; there is no retry action, but the save button remains. API database failures are not normalized, so the client may fall through to its generic “Couldn’t reach the server” catch.
- **Danger zone:** no unavailable/error state because no action is attempted. Its dialog explicitly calls itself a UI preview; post-confirmation message says nothing was deleted.
- Shared `EmptyState` and `ErrorState` exist and are used for audit search no-match and other application flows, but not as evidence of live Phase 9 request handling.

## Database & Migration Findings

- `migrations/001_protodb_admin_schema.sql` contains `protodb_admin.audit_log` and `protodb_admin.notification_preferences`; no later migration adds Phase 9 monitoring samples or additional audit indexes.
- Audit columns are `id`, `actor`, `action`, `resource`, `result`, `ip`, and `at`. `at` is server-generated `timestamptz`; `result` is checked; actor/action/resource are non-null strings. There is only `audit_log_at_idx(at desc)`. No foreign key links actor to `users`, no composite indexes support actor/action/resource/result filtering, and no partition/retention/deletion schedule is present.
- Preferences consist of `(user_id, event_id)` primary key and non-null `in_app default true`, `email default false`, with user cascade-delete. There are no seeded event rows, event whitelist/check constraint, updated timestamp, optimistic version, or API/service. Column defaults define inserted-row defaults only; they do not create preferences for a new user.
- `migrations/002_sql_editor_history.sql` is the only persisted Phase 6 execution history. It is user-linked, indexed by `(user_id, created_at desc, id desc)`, and the route caps per-user rows at 100. It is not a system-wide slow-query/statistics table.
- No migration creates connection/error history, a telemetry collection schedule, notification delivery/outbox, workspace settings, workspace entity, or deletion lifecycle. No retention behavior is configured for the growing audit table.
- Do not apply or author migrations as part of this audit. If Phase 10 later introduces a server-backed audit/preferences design, define access/retention/indexing and cross-request consistency before writing a migration.

## Test Coverage Findings

Tracked tests are `tests/phase5-schema-validation.test.mjs`, `tests/phase6-sql-editor.test.mjs`, `tests/phase7-storage.test.mjs`, `tests/phase7-s3.integration.test.mjs`, and `tests/phase8-users.test.mjs`. `package.json` has scripts for Phases 5–8 and none for Phase 9.

- No tests cover audit writer schema/behavior, audit-log retrieval, actor/action/resource/result/date filters, sorting/pagination, authentication/authorization of audit reads, duplicate/lost event behavior, or logging failures.
- No tests establish monitoring source correctness, pool metrics, historical collection, slow-query semantics, error-rate aggregation, unavailable states, or fake-vs-live labels.
- No tests cover notification preference defaults, user scoping, database reads/writes, persistence after reload, validation, race/concurrent updates, or save failures.
- No tests cover profile persistence/validation/error mapping or danger-zone no-op wording/confirmation/server protections.
- Phase 5–8 regression tests do not exercise Phase 9 paths; their presence is not Phase 9 coverage.

Recommended future Phase 9/10 tests:

1. Unit tests for audit filter parsing/validation, date-range boundaries, deterministic paging/order, and stable mapping of database rows; cover empty and malformed inputs.
2. Route tests for unauthenticated/unauthorized audit access, parameterized filters, bounded page sizes, safe errors, and user/account scope.
3. Writer tests for action/result/actor/resource/time mapping; failures, rejected operations, direct auth writes, duplicate handling and missing event cases. Verify an audit write failure is observable without falsely claiming an event is durable.
4. Monitoring unit tests proving each displayed field maps to its documented source and never substitutes mock/empty/error with healthy zero; test no-history and unavailable catalog/configuration behavior.
5. Query-history tests if it is reused: confirm per-user ownership, cap, time/duration filtering and that the label does not imply all-database slow-query coverage.
6. Preference API/database tests for session-derived user ID, allowed event IDs/channels, missing-row defaults, upsert semantics, reload persistence, DB errors and concurrent writes.
7. Profile tests for own-account scope, validation bounds, persistence, safe errors and audit coverage.
8. Danger-zone browser/API tests proving cancellation is a no-op, preview confirmation cannot report deletion success, and any future real endpoint enforces auth/authorization and handles partial failure.
9. Browser checks for labels, date/result controls, keyboard interactions, loading/error/retry/empty/unavailable states and source-identifying text.

## Documentation Findings

- `README.md` lines in the `/audit` section call the page Phase 9’s “real deliverable” and describe its audit trail and System Health connection pool/error-rate sparkline/slow-query log without indicating that they are fixture data. This overstates live behavior.
- The `/settings` README section calls profile, notification preferences and danger zone a Phase 9 “real deliverable” without distinguishing live profile save from local-only preferences and preview-only deletion.
- README claims “Routes listed above may combine live, demo, and UI-only pieces; each page labels its data source and the behavior available in that mode.” This claim is inaccurate for `/audit` and for `/settings` notification preferences.
- `ROADMAP.md` correctly states globally that mock data is allowed through Phase 9 and Phase 10 backs every page’s APIs; its Phase 10 progress explicitly says audit-log reading remains mock/pending. Its progress table marks Phase 9 done, so the meaning should be clarified (UI prototype vs live data) rather than silently contradicting its Phase 10 description.
- `app/audit/page.tsx` comment acknowledges `lib/mock-data.ts` seed log and Phase 10 reading; the rendered page does not show this boundary. `components/audit/system-health-panel.tsx` has no source disclaimer. `app/settings/page.tsx` documents local notification state and Phase 10 wiring, while the actual notification component itself does not communicate local-only state. `DangerZoneSection` does disclose its preview in the dialog and completion text, but its description overstates the preview effect.
- `lib/dashboard/stats-service.ts` / `app/api/dashboard/stats/route.ts` correctly describe the live catalog source; route errors nevertheless expose raw error text.
- `.env.example` documents `DATABASE_URL`, SSL and Storage variables, but no Phase 9 telemetry/notification configuration. It should not imply any external metrics or email provider is already configured.

## Dependencies & Blockers

- No credentials, live database, production storage, or external monitoring/email provider were accessed. Runtime state, installed migrations, catalog privileges, current audit rows, data volume, PostgreSQL log settings, and database grants remain unverified. A legitimate disposable/local database can be used later for read/write persistence checks; do not infer live state from this static audit.
- The official roadmap PDF and Phase 1–9 Gap & Repair Report were unavailable locally; confirm whether either has requirements that differ from `ROADMAP.md` before implementation.
- `ROADMAP.md` intentionally defers page API/data integration to Phase 10. In particular, it explicitly says reading `protodb_admin.audit_log` is pending; do not silently move that integration into Phase 9.
- The migration already has a preference table, but preference APIs and default row/event policy do not exist. Whether persistence is Phase 9 or Phase 10 should be resolved against the official specification; the checked-in roadmap’s Phase 10 “API routes backing every page” boundary points to Phase 10 for real persistence.
- Historical pool/error data requires an actual collection source and persistence/retention interval; none is present. A static array or one-time current snapshot cannot verify history.
- `pg_stat_statements` is not configured in repository migrations/environment documentation and is not queried. PostgreSQL server settings/extensions or operational log access may require database-owner/provider work; do not assume availability.
- Real audit retrieval needs a server-side authorization policy for sensitive actor/IP fields and bounded/indexed pagination. Existing fixed roles do not define audit-read capability. It also needs a deliberate choice for retention and the existing best-effort logging gap.
- Real workspace deletion, account deletion, password changes, or external notification delivery would expand scope and require separate Phase 10 architecture/authorization and failure handling. They are not implemented and must not be introduced merely to make the preview look live.

## Recommended Repair Order

### Repair/clarify within Phase 9, respecting demo allowance

1. Correct `/audit` and `/settings` source labels in the UI and documentation: mark seeded audit rows, system-health values, local preferences and deletion preview as demo/reference/local-only; distinguish the profile’s real saved field. Correct README’s “real deliverable” and “each page labels” claims. Do not claim current monitoring is healthy based on fixtures.
2. Make Phase 9 prototype behavior precise: label filter scope as local sample data; add the requested date-range/filter affordances only as demo UI if required by the checked-in spec; identify empty sample lists separately from no live records. Ensure no live-looking label accompanies static telemetry.
3. Correct the connection card’s semantics and unavailable messaging. Either call the present dashboard count a live database-wide snapshot and keep it distinct from app-pool counters, or label the System Health pool panel demo-only. Do not present the fixture series as recorded history.
4. Keep the danger zone explicitly preview-only. Remove or qualify its statement that it deletes real tables/buckets/members unless a real operation is separately approved; ensure preview completion wording cannot be confused with success.
5. Add Phase 9 unit/browser tests for demo/live labeling, local filter behavior, result/time-range UI semantics, empty/error/unavailable display, and explicit danger-zone no-op. Preserve the Phase 5–8 suites.

### Keep mock/demo until Phase 10 or explicit updated scope

6. Do not wire the audit screen to `protodb_admin.audit_log` in this phase unless the authoritative Phase 9 spec explicitly overrides the checked-in roadmap. Phase 10 must define server-side audit-read authorization, parameter validation, bounded pagination, query/index strategy, safe errors and retention before live retrieval.
7. Keep notification switches local and labeled as such through Phase 9; real read/upsert/user scoping and persistence after reload belong with the Phase 10 API work under the current roadmap.
8. Keep historical connection/error monitoring and broad PostgreSQL slow-query visibility unavailable/demo until a documented collector/source, sampling policy, retention and permissions exist. `pg_stat_activity` current snapshot and Phase 6 per-user query history are not substitutes for full historical/system-wide data.
9. Keep destructive workspace/account deletion as preview-only. Any real deletion, password/security setting, or delivery provider requires separately scoped Phase 10 work and server-side authorization/audit/partial-failure safeguards.

### Phase 10 prerequisites when authorized

10. Reconcile best-effort `logAuditEvent` semantics with audit completeness: choose durable retry/outbox or an explicit detectable degraded state; cover missing mutation/auth operations without allowing logging failure to masquerade as a recorded event.
11. Design audit identity, indexes, retention, and tamper-resistance consistent with privileged SQL access; verify actual DB role grants only in an approved environment.
12. Decide preference event catalog/default rows and per-user API semantics, then test persisted changes after reload.
13. Choose the actual source for pool metrics, slow queries and error rate; document units/window/numerator/denominator and multi-instance behavior. Present absence/configuration failures as unavailable, not zero or success.

## Verification Plan

For the eventual implementation, do not use static fixtures as a proxy for live verification. Run:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`
- `npm run test:phase5`
- `npm run test:phase6`
- `npm run test:phase7`
- `npm run test:phase8`
- a new focused `npm run test:phase9` suite covering the recommended cases above.

Browser/runtime checks should verify authenticated and unauthenticated access, clear live/demo/unavailable labels, every filter including dates, empty audit data, loading/errors/retry, stale/unavailable monitoring, local-only notification messaging, saved profile state, and that confirming/canceling the danger-zone preview never indicates a real deletion.

Only where legitimate disposable/local credentials are explicitly available, perform non-destructive database-backed checks: create a known test audit event through a safe test route/service, verify it appears in a real retrieval response, and exercise actor/action/resource/result/time filters and pagination; save a notification preference for the test account and verify it persists after reload; validate profile persistence and safe errors. For monitoring, compare each displayed current metric to its documented read-only source and verify missing permissions/history produce “unavailable,” not zero/healthy. Do not perform actual destructive actions or modify production data/permissions. Verify unauthorized requests return `401`/`403` as appropriate and all filters are parameterized.

Acceptance scenarios, if and when they are in scope:

- A genuine persisted audit event appears in a database-backed audit response and UI, with correct actor, action, resource, result, timestamp.
- Actor/action/resource/result/time filters constrain actual persisted records; pagination is bounded and deterministic.
- Notification preferences survive a reload and remain scoped to the authenticated user.
- Profile changes survive reload; failures are surfaced and never produce a “Saved” state.
- Monitoring values cite their actual source; historical charts use persisted observations; absent metrics/history say unavailable.
- A danger-zone preview cannot claim success; any future real destructive API is server-authorized, auditable, safely confirmed, and accurately reports partial failure.
- Unauthorized requests fail server-side; no frontend-only visibility rule is treated as access control.

## Explicit Phase 10 Deferrals

- The checked-in roadmap says Phase 10 provides API routes for pages 2–9 and explicitly identifies reading `protodb_admin.audit_log` as still pending. Real audit search/filter retrieval is therefore a Phase 10 dependency unless the unavailable official PDF states otherwise.
- Persisted notification-preference reads/writes are not present; despite the table existing, wiring them to per-user APIs belongs with the roadmap’s Phase 10 integration boundary.
- Real historical pool/error telemetry, system-wide slow-query collection, retention and external log/statistics providers do not exist. Do not call the Phase 6 per-user, last-100 SQL history a full slow-query log.
- Real workspace/account deletion, password changes/security settings, connected accounts and external notification delivery are absent; do not start these without explicit scope and architecture.
- Database grant/catalog visibility and production operational settings were not runtime-verified and must not be guessed or changed as part of Phase 9.

## Final Assessment

The repository has genuine audit **writers** and genuine profile persistence, plus a live Dashboard snapshot of selected PostgreSQL statistics. It does not have a live audit **reader**, persisted notification UI, Phase 9 monitoring history, slow-query source, error-rate calculation, or real danger-zone operation. The `/audit` data is static and currently unlabeled; monitoring charts and rows are fabricated fixtures, while the connected dashboard snapshot is a different metric with different semantics. The current implementation is therefore not an operational audit/monitoring system and must not be relied upon for incident review or health decisions.

The safest Phase 9 boundary is an honest, fully labeled demo/prototype with accurate interaction and unavailable states. Real audit retrieval and persisted settings must follow the repository’s Phase 10 integration order unless the authoritative missing roadmap specification explicitly directs otherwise. No Phase 9 implementation has been started by this audit.
