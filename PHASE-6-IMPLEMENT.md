# ProtoDB — Phase 6 SQL Editor Repair & Implementation

## Baseline

Current committed baseline:

`ae809f1` — `Phase 5 — Schema Designer repair`

Phase 5 is complete for this repair pass. Do not revisit Phase 5.

Use:
- current repository as the source of truth
- official ProtoDB Admin Roadmap as the intended scope
- ProtoDB Phase 1–9 Gap & Repair Report as the gap analysis

The Phase 6 audit found:
- SQL execution is currently mocked via `runMockQuery()`
- there is no server-side SQL execution API/service
- query history and saved queries are client-state/mock seeded
- autocomplete uses mock metadata
- error position is approximate
- exports use mock results and CSV needs hardening
- authentication exists at the page level but there is no server-side SQL execution authorization boundary

## IMPORTANT SCOPE

Implement ONLY Phase 6 — SQL Editor.

Do NOT implement:
- Phase 7 Storage
- Phase 8 Users/Roles
- Phase 9 Audit/Monitoring UI
- unrelated Phase 10/11 work

Do not modify existing real database data during development unless using a disposable test database/schema specifically for verification.

Do not bypass authentication or guess credentials.

## PRIMARY GOAL

Turn the existing SQL Editor from a mock prototype into a real PostgreSQL-backed SQL Editor while preserving its existing UI structure.

Reuse:
- `components/queries/queries-workspace.tsx`
- `components/queries/sql-editor.tsx`
- `components/queries/query-results.tsx`
- `components/queries/query-history-panel.tsx`
- `components/queries/query-tabs.tsx`
- `lib/sql-highlight.ts`
- `lib/db/client.ts`
- `lib/auth/session.ts`
- `lib/auth/authorization.ts`
- `lib/audit/log.ts`
- existing `protodb_admin.saved_queries` migration/table

Do not create duplicate competing editor implementations.

## 1. REAL SQL EXECUTION

Implement a server-side SQL execution route/service.

Requirements:
- authenticate the request server-side
- authorize SQL execution server-side
- execute against PostgreSQL using the existing DB infrastructure
- return real rows/columns
- return actual row count where applicable
- return actual execution duration
- return structured errors
- provide useful error position information when PostgreSQL provides a position
- do not expose unnecessary secrets or internal diagnostics

Define and enforce an explicit operational policy for:
- maximum SQL text size
- statement timeout
- result-size/row limits
- concurrent execution limits where practical
- multi-statement behavior
- transaction behavior

Do not silently reduce the feature to a fake SELECT simulator.

Do not introduce arbitrary shell/database access outside the SQL Editor execution path.

## 2. AUTHORIZATION

Use the existing signed-in session system.

Requirements:
- unauthenticated requests rejected
- authorization checked on the server
- use existing roles/helpers where appropriate
- do not implement the entire Phase 8 permission matrix
- document the execution policy in code/README where appropriate

Do not trust a client-provided email or user ID for authorization.

## 3. SQL SAFETY / OPERATIONAL CONTROLS

Because SQL Editor can execute powerful SQL:
- validate the request envelope
- enforce query size limits
- enforce statement timeout
- enforce result row/output limits
- define how multiple statements are handled
- define transaction behavior explicitly
- prevent server resource exhaustion
- sanitize errors returned to the client

Do not add a brittle SQL parser intended to “secure” arbitrary SQL unless the roadmap/report specifically requires one.

Preserve the existing database identifier-validation system for any application-generated SQL.

## 4. REAL RESULTS UI

Wire `QueryResults` to the real execution response.

Display:
- columns
- returned rows
- row count
- execution duration
- empty-result state
- execution error
- error position / line / column when available

Ensure loading state is real and tied to the request lifecycle.

Keep results isolated per query tab.

## 5. ERROR POSITION / EDITOR FEEDBACK

When PostgreSQL supplies a character position:
- convert it to line/column against the submitted SQL
- display useful location information
- highlight or navigate to the affected location when practical
- do not claim precision that the source does not provide

Preserve the lightweight existing SQL highlighting implementation unless an upgrade is genuinely necessary.

## 6. PERSISTED QUERY HISTORY

Implement real per-user query history persistence if required by the Phase 6 roadmap.

Requirements:
- associate history with authenticated user
- persist useful executed-query metadata/status
- preserve useful duration/error information
- order by recent execution
- isolate one user's history from another user's
- enforce reasonable retention/size limits
- do not store huge result sets unless explicitly required

If a new migration/table is needed, keep it narrowly scoped to Phase 6.

## 7. SAVED QUERIES

Wire the existing `protodb_admin.saved_queries` table into the SQL Editor.

Requirements:
- list saved queries for the current user
- create/save a query
- rename/update where existing UI supports it
- delete saved query
- load saved query into the editor
- enforce ownership server-side
- persist across reloads
- provide loading/error/empty states

Do not trust a client-supplied `user_id`.

## 8. AUTOCOMPLETE

Replace mock identifier suggestions with authorized live schema metadata.

Use existing schema services where practical.

Requirements:
- suggestions reflect accessible current schema/table/column metadata
- do not expose metadata the current user cannot access
- preserve the existing editor UX where practical
- keep a clear demo/offline fallback only when intentionally running without a real DB

Do not use the hard-coded mock catalog as the live source.

## 9. MULTIPLE TABS / PANES

Preserve the existing query-tab experience.

Ensure:
- each tab maintains its own SQL
- execution result/error belongs to the correct tab
- loading state belongs to the correct tab
- closing a tab does not corrupt another tab's state

Tab persistence across browser restarts is not required unless already supported by the roadmap.

## 10. CSV / JSON EXPORT

Keep existing export UI but make it operate on real query results.

CSV:
- correctly quote commas, quotes, LF and CR
- define an explicit NULL representation
- protect against spreadsheet formula injection for cells beginning with `=`, `+`, `-`, or `@`
- preserve Unicode safely

JSON:
- preserve actual result values as accurately as practical
- preserve SQL NULL as JSON `null`

Do not export mock rows when live execution is active.

## 11. MOCK ENGINE

`lib/sql-mock-engine.ts` is active demo/reference code.

Do not let it remain disguised as live execution.

Use a clear split:
- live database connected -> real execution
- demo/offline mode -> clearly labelled mock/reference

If the mock parser remains:
- reject unsupported SQL shapes instead of silently reporting misleading success
- ensure the UI clearly says demo/mock

Do not delete it unless removal is clearly safe.

## 12. AUDIT LOGGING

Use existing audit infrastructure for SQL execution where appropriate.

Do not blindly store full raw SQL if it could capture sensitive secrets/credentials.

Prefer metadata such as:
- actor
- action
- result/status
- schema/resource scope when known
- execution timing
- safe summary/identifier

Document deliberate omission of raw SQL when applicable.

## 13. DATABASE CONNECTION

Reuse `lib/db/client.ts`.

Do not create an unnecessary second application database pool.

Keep connection handling safe and avoid leaking clients.

If statement timeout support is needed, implement it without unintentionally changing unrelated database operations.

## 14. TESTS

The repository currently has a Phase 5 test script but no SQL Editor tests.

Add focused Phase 6 tests for logic-heavy behavior:
- request validation
- authorization decisions
- query size limits
- error-position conversion
- result-size limits
- CSV escaping
- spreadsheet-formula protection
- JSON export formatting
- saved-query ownership
- history ownership
- mock-engine unsupported-query rejection if the demo path remains

For database integration:
- use a disposable PostgreSQL database/schema only
- never run destructive tests against real application data

## 15. BUILD / LINT / TEST

Run:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- focused Phase 6 tests
- `git diff --check`

Fix Phase 6-related errors. Do not hide or ignore failures.

## 16. RUNTIME VERIFICATION

If a safe authenticated PostgreSQL environment is available, verify:
- real SELECT
- real errors
- row count and timing
- autocomplete metadata
- saved-query persistence
- history persistence
- CSV/JSON exports
- authorization

If a safe environment is NOT available:
- do not bypass auth
- do not guess credentials
- do not modify real application tables
- do not apply broad grants
- report exactly what remains unverified

## 17. SELF-REVIEW

Before finishing:
- review the complete diff
- remove unrelated changes
- ensure no Phase 7–11 work was introduced
- ensure no mock results are presented as live
- ensure server-side authorization is real
- ensure SQL operational limits are enforced
- ensure saved queries/history are user-scoped
- ensure exports use actual results
- ensure no sensitive raw SQL is unnecessarily persisted

## FINAL REPORT

Return exactly:

# PHASE 6 IMPLEMENTATION REPORT

### A. Files changed
### B. Real SQL execution implementation
### C. Authorization/security implementation
### D. Query history implementation
### E. Saved query implementation
### F. Autocomplete implementation
### G. Results/errors/export implementation
### H. Mock/demo separation
### I. Audit logging
### J. Tests added and results
### K. Typecheck result
### L. Lint result
### M. Build result
### N. Runtime verification
### O. Runtime limitations/blockers
### P. Phase 6 requirements still incomplete
### Q. Confirmation that no later roadmap phase was implemented

Do not start Phase 7 after this.
"""

path = Path('/mnt/data/PHASE-6-IMPLEMENT.md')
path.write_text(content, encoding='utf-8')
print(f'Created: {path} ({path.stat().st_size} bytes)')
