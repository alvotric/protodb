# PHASE 9 — AUDIT LOGS & SYSTEM MONITORING — IMPLEMENTATION & REPAIR

You are implementing **Phase 9 only** in the current ProtoDB Admin repository.

## Authoritative inputs

Use these as the source of truth:

1. Checked-in `ROADMAP.md`
2. Completed `PHASE-9-AUDIT.md`
3. Current repository baseline:
   `77d8b19e85bcd42d86b901bee23c1637a5e074c1`
4. Existing Phase 7 baseline:
   `c093b33261501b04998947cc743d462a44095753`
5. Existing Phase 6 baseline:
   `1ea1ef0b62b93829a1b74a059a335ae59ca4d8e9`

The Phase 9 audit found a mixed baseline:
- real audit writers already exist for several auth, table, schema/DDL, SQL, and Storage operations;
- `/audit` still renders fixture audit events;
- `/audit` system health renders fabricated connection/error history and fabricated slow-query rows;
- notification preferences are local-only despite `protodb_admin.notification_preferences` existing;
- the profile-name update is already a real authenticated update;
- the danger zone is a disclosed preview/no-op;
- there is no Phase 9 audit-read API/service;
- there are no dedicated Phase 9 tests.

The official roadmap PDF was not locally available during the audit. Do not invent requirements beyond the roadmap and audit.

---

# 1. PHASE BOUNDARY

Implement **Phase 9 only**.

Do NOT start or implement:
- Phase 10
- Phase 11
- external Slack/PagerDuty or other alerting integrations
- a new authentication architecture
- PostgreSQL role administration
- a new workspace architecture
- unrelated refactors

The roadmap's Phase 9 scope is:
- searchable/filterable audit trail
- actor/action/resource/result/time-range filters
- system health: connection pool, slow-query log, error rate over time
- notification preferences
- workspace/account Settings
- danger zone

The roadmap states that external alerting integrations are post-roadmap work.

Where the repository does not have a trustworthy real source for a metric, do NOT fabricate one. Show the metric as unavailable or clearly demo/reference instead.

---

# 2. PRIMARY GOAL

Turn the Phase 9 experience into a **correct, source-transparent, security-conscious implementation** using the real infrastructure that already exists.

The implementation must:
- display real persisted audit records where the roadmap/audit requires it;
- make audit filters operate on real data;
- persist notification preferences for the authenticated user;
- preserve existing real profile/settings behavior;
- use real monitoring sources when they genuinely exist;
- distinguish live snapshots from historical telemetry;
- never display fabricated telemetry as live;
- keep unsupported historical metrics explicitly unavailable;
- keep danger-zone destructive operations unavailable unless there is a safe, already-supported implementation path;
- provide proper loading/empty/error/unavailable states;
- preserve Phases 4–8 behavior and security.

Do not make the UI merely "look live."

---

# 3. BEFORE EDITING — DEEP INSPECTION

Before changing code:
1. Read `PHASE-9-AUDIT.md` completely.
2. Read the relevant sections of `ROADMAP.md`.
3. Inspect the complete current Phase 9 implementation.
4. Trace:
   `UI -> state -> API/action/service -> DB/source -> persistence -> authorization -> error handling`
5. Reuse existing services instead of duplicating them.
6. Identify all mock/static paths and replace them only where a trustworthy real source exists.
7. Preserve existing working code.
8. Do not silently change Phase 4–8 security semantics.

Do not start editing until this inspection is complete.

---

# 4. AUDIT LOG — REAL DATA IMPLEMENTATION

The `/audit` page must read audit events from the real:
`protodb_admin.audit_log`

Create or extend a server-side audit read service/API.

Requirements:
- authenticated session required;
- authorization checked server-side;
- read only;
- parameter validation;
- bounded pagination;
- deterministic ordering;
- safe database query;
- parameterized filter values;
- safe dynamic filtering;
- useful structured errors;
- no secret leakage.

Support:
- actor filter
- action filter
- resource filter
- result/status filter
- start time
- end time
- search where supported/appropriate
- page/page size or cursor
- deterministic sort by timestamp plus stable tie-breaker

Do not keep the fixture array as the live audit source.
A demo/reference path may remain only if clearly labeled.

Preserve the real available fields:
- id
- actor
- action
- resource
- result
- ip
- at

Do not invent foreign-key identity from the current `actor` text field.

Filters must execute against the database, not filter a full dataset in React.

For dynamic sort/filter fields use explicit allow-lists.
For values use parameters.
Validate date ranges, page size, filter strings, sort fields, and sort direction.

Update the UI with:
- loading
- empty
- error
- retry
- filters
- clear/reset
- pagination if needed
- visible time range
- visible result
- live source indication

Use wording such as:
`Live audit log — protodb_admin.audit_log`

Do not claim that every system event is necessarily logged.

---

# 5. AUDIT EVENT COVERAGE

Keep existing audit writers intact unless a narrowly scoped Phase 9 fix is necessary.

Do not rewrite every route just to make coverage look complete.

The audit found that `logAuditEvent` is best-effort and can fail without failing the originating mutation.

Do not silently turn audit logging into a transaction-wide blocking dependency unless the existing architecture explicitly supports that safely.

Avoid duplicate events.
Preserve action/resource/result semantics.
Do not store secrets or unnecessary raw SQL.

Document remaining best-effort or coverage limitations accurately.

---

# 6. SYSTEM HEALTH — REAL SOURCE FIRST

Inspect existing dashboard/database stats infrastructure before adding health queries.

Reuse existing real services where their data is appropriate.

Do not duplicate PostgreSQL activity queries unnecessarily.

---

# 7. CONNECTION HEALTH / POOL

The audit found that the existing dashboard connection metric is a current PostgreSQL activity snapshot, not necessarily the Node `pg.Pool`.

Therefore:
- do NOT label `pg_stat_activity` as the Node application pool itself;
- do NOT fabricate a historical pool series;
- do NOT invent historical connection points.

Provide trustworthy current connection-health information where a real source exists.

Clearly label:
- current database connections/activity
- configured maximum connections where available
- snapshot time
- unavailable history where no history exists

If a requested metric has no trustworthy source, show:
`Unavailable — no persisted/history source is available`

Do not fabricate values.

---

# 8. SLOW-QUERY LOG

Do NOT call Phase 6 `query_history` a global PostgreSQL slow-query log.

The audit found Phase 6 history is per-user execution history, not global PostgreSQL telemetry.

Use an existing trustworthy PostgreSQL statistics/catalog source only if one actually exists and is safely accessible.

If no trustworthy source exists, show an explicit unavailable state such as:
`Slow-query history unavailable — no configured historical source`

Do NOT use the existing mock `slowQueryLog` as live data.
Do NOT invent a telemetry scheduler/background worker just to manufacture history.

---

# 9. ERROR RATE OVER TIME

Do not fabricate an historical error-rate chart.

Use a trustworthy existing source only where its semantics support a defensible calculation.

Before exposing an error-rate metric, define:
- source
- numerator
- denominator
- time window
- aggregation
- refresh behavior
- insufficient-data behavior

If a defensible historical rate cannot be produced:
- expose only genuinely supported current/derived information;
- explicitly label historical rate as unavailable;
- do not render fabricated chart points;
- do not convert missing data to zero.

---

# 10. MONITORING SOURCE DISCLOSURE

Every System Health metric must identify its source.

Include a source/definition subtitle or affordance describing:
- metric
- source
- snapshot vs historical
- refresh
- limitations

Examples:
`Current database connections — pg_stat_activity snapshot`
`Historical error rate — unavailable (no persisted series)`

Do not use vague "Live" labels for mock or unrelated data.

---

# 11. REMOVE / ISOLATE MOCK HEALTH DATA

The existing:
- `dbHealth`
- `connectionPoolSeries`
- `errorRateSeries`
- `slowQueryLog`

fixtures must NOT remain on the live System Health path.

Remove them from the live path if unused, or retain only as explicit demo/reference fixtures.

Do not accidentally connect the demo implementation to the live page.

---

# 12. NOTIFICATION PREFERENCES — REAL PERSISTENCE

The database contains:
`protodb_admin.notification_preferences`

with:
- user_id
- event_id
- in_app
- email

Implement a real authenticated read/write service or API using the existing table.

Requirements:
- derive user ID from the server session;
- never trust a client user ID;
- read current preferences;
- provide documented defaults when rows are missing;
- persist updates;
- survive reload;
- validate allowed event IDs;
- validate allowed channels;
- prevent cross-user access;
- handle DB errors;
- provide loading/saving/error states.

Use a centralized event allow-list if the schema lacks an event constraint.
Do not allow arbitrary event IDs from the client.

Missing row must not incorrectly imply "all disabled".
Only report save success after persistence succeeds.

---

# 13. SETTINGS / PROFILE

Preserve existing real authenticated profile update behavior.

The audit found `app/api/auth/profile/route.ts::PATCH` updates the authenticated user's name using server-derived identity and parameterized values.

Do not replace real persistence with client-only state.

Inspect Settings and distinguish:
- persisted
- session-derived
- local-only
- mock
- unsupported

Wire only the persistence already appropriate to Phase 9.
Provide meaningful loading/saving/error states.

Do not redesign authentication.

---

# 14. DANGER ZONE

The current danger-zone action is a preview/no-op.

Do NOT implement destructive workspace/account deletion merely to make the button work.

Unless a complete, authorized, safe deletion path already exists within this phase:
- keep it unavailable/preview-only;
- clearly state that no deletion occurred;
- never show fake deletion success.

Do not execute destructive operations during runtime verification.

---

# 15. MOCK/LIVE SEPARATION

Make `/audit` and System Health explicit about source state.

For live data: show a source label.
For unavailable data: show an unavailable state.
For demo/reference data: show a Demo/Reference label.

Do not combine a real session with fictional audit/monitoring data without disclosure.

---

# 16. LOADING / EMPTY / ERROR / UNAVAILABLE STATES

Implement meaningful states for:

Audit:
- loading
- no records
- filtered empty
- server error
- retry

System Health:
- loading
- current data
- unavailable metric
- database/query error
- no history

Notification settings:
- loading
- defaults/no rows
- saving
- saved
- save error

Settings:
- loading where needed
- saving
- validation error
- server error

Danger zone:
- explicitly unavailable/preview

Use existing shared components such as `EmptyState`, `ErrorState`, skeletons, and dialogs.

Never represent an error as zero or a healthy metric.

---

# 17. DATA/SERVICE ARCHITECTURE

Prefer:
`UI -> Phase 9 API/service -> existing DB infrastructure`

Create focused reusable services where needed:
- audit read service
- notification preference service
- health metrics service

Keep DB queries out of React components.

Reuse the existing database client.

Do not create a second unnecessary DB pool.

---

# 18. SECURITY / AUTHORIZATION

Every new Phase 9 API/service must:
1. establish authenticated session;
2. authorize the operation;
3. validate input;
4. parameterize values;
5. allow-list dynamic fields;
6. avoid secret leakage;
7. enforce user scope for notification preferences;
8. protect destructive actions server-side if they exist.

Frontend disabling is NOT security.

Preserve Phase 4–8 security semantics.

---

# 19. AUDIT QUERY SECURITY

For audit filtering:
- never interpolate raw filter values;
- allow-list sort/filter fields;
- parameterize values;
- bound page size;
- safely parse date ranges;
- define date boundary semantics;
- deterministic ordering.

Do not expose arbitrary query capabilities.

---

# 20. TESTS

Add a focused Phase 9 test suite matching project conventions, for example:
`tests/phase9-audit-monitoring.test.mjs`

At minimum cover:

## Audit retrieval
- actor filter
- action filter
- resource filter
- result filter
- date range
- pagination/limits
- deterministic ordering
- malformed inputs
- empty results

## Audit security
- unauthenticated rejection
- unauthorized rejection where applicable
- session-derived scope
- safe errors
- allow-listed fields

## Notification preferences
- defaults when row missing
- persisted read
- persisted update
- authenticated user scoping
- invalid event rejection
- reload persistence semantics
- DB error handling

## Health metrics
- documented source mapping
- snapshot semantics
- unavailable historical metrics
- no fallback from unavailable/error to fake zero
- mock fixtures not returned as live

## Slow queries
- query history is not mislabeled as global slow-query telemetry
- unavailable state without real source
- safe mapping if real source exists

## Error rate
- correct aggregation if defensible source exists
- insufficient data
- unavailable behavior
- no fabricated history

## Danger zone
- cancel/preview is no-op
- no fake deletion success
- explicit unavailable wording

## Settings/profile
- authenticated user scope
- persistence path
- validation/errors where applicable

Do not write tests that merely assert UI strings.

---

# 21. REGRESSION VERIFICATION

Run:
1. `npm run test:phase5`
2. `npm run test:phase6`
3. `npm run test:phase7`
4. `npm run test:phase8`
5. Phase 9 tests

Inspect `package.json` if exact script names differ.

---

# 22. TYPECHECK / LINT / BUILD

Run:
```text
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Fix relevant Phase 9 failures.
Do not hide failures.
Report pre-existing unrelated lint warnings separately.

---

# 23. RUNTIME VERIFICATION

With a legitimate safe authenticated database environment, verify:

Audit:
- real event exists
- API reads it
- UI displays it
- filters work
- pagination/order work

Notification preferences:
- read persisted state
- update state
- reload and confirm persistence

Settings:
- update own profile
- reload and confirm persistence

Monitoring:
- current values match documented real source
- unavailable metrics are honestly unavailable
- mock telemetry is never presented as live

Danger zone:
- do not perform real destructive actions
- verify only preview/unavailable behavior and cancellation

Without a safe environment:
- do not bypass auth
- do not guess credentials
- do not change permissions
- do not modify real data
- report exact runtime limitations

---

# 24. DOCUMENTATION

Update only documentation directly made inaccurate by this Phase 9 repair.

Review:
- `README.md`
- `ROADMAP.md`
- relevant comments/config docs

Correct overclaims about:
- real audit history
- real monitoring
- error rate
- slow-query data
- persisted notification settings
- danger-zone deletion

Document monitoring sources and unavailable metrics where useful.

Do not claim Phase 10 is complete.

---

# 25. FILE / CHANGE SAFETY

Do not modify:
- production data
- production storage
- database permissions
- secrets
- real credential files

Do not automatically commit or stage.

Do not modify unrelated Phase 4–8 files unless a minimal compatibility fix is clearly required.

Do not delete existing instruction/audit files.

Do not start Phase 10 or Phase 11.

---

# 26. FINAL SELF-REVIEW

Before finishing:
- inspect the complete diff;
- verify only Phase 9-related changes remain;
- verify no fake telemetry is on the live path;
- verify audit filters are DB-backed;
- verify notification updates persist;
- verify user scope comes from session;
- verify danger zone never reports fake deletion;
- verify Phase 4–8 authorization semantics remain intact;
- verify regression tests pass;
- verify no later phase was implemented.

---

# 27. FINAL IMPLEMENTATION REPORT

Return:

## A. Files changed
Exact path and purpose.

## B. Audit log implementation
Read source, API/service, filters, pagination, auth, UI, source label.

## C. Monitoring implementation
For each metric: source, current/historical, live/unavailable, UI behavior.

## D. Notification preferences
Read, write, defaults, scope, persistence.

## E. Settings/profile
Existing persistence preserved and Phase 9 changes.

## F. Danger zone
Exactly what remains unavailable/preview-only.

## G. Mock/live separation
Retained demo/reference data and labels.

## H. Tests
Exact counts/results.

## I. Verification
TypeScript, lint, build, diff check, Phase 5/6/7/8/9 tests.

## J. Runtime verification
What was verified and what was blocked.

## K. Explicit Phase 10 deferrals
Everything intentionally left for the later backend/data integration boundary.

## L. Git status
Current HEAD, worktree state, changed files, and confirmation that no commit was created.

Do not create a commit.
Do not stage anything.

---

# 28. STOP CONDITIONS

Stop and report before changing anything if implementation would require:
- external alerting integration
- production Slack/PagerDuty integration
- new authentication architecture
- destructive real-data deletion without an established safe implementation
- database permission changes
- unsafe direct SQL
- a new background system solely to fabricate telemetry
- Phase 10 architecture
- Phase 11 production infrastructure

Do not guess.
Do not fabricate.

The goal is a **truthful, source-backed, secure Phase 9 implementation** using the real infrastructure that exists, while explicitly leaving unsupported telemetry and destructive behavior unavailable rather than pretending they are real.
