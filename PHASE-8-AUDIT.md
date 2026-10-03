# Phase 8 Audit - Users, Roles & Permissions

## Scope and evidence

- Audited baseline: `c093b33261501b04998947cc743d462a44095753` (Phase 7), including Phase 6 commit `1ea1ef0b62b93829a1b74a059a335ae59ca4d8e9`.
- The repository contains `ROADMAP.md`, but no `ProtoDB-Admin-Roadmap.pdf` or separate project ZIP was found under the project tree. This audit uses the checked-in roadmap as the available scope source; confirm against the official PDF if it differs.
- `ROADMAP.md` Phase 8 requirements are the team list/invite/four fixed roles, per-resource permissions for schemas/tables/buckets, member suspend/reactivate/remove, and a read-only RLS policy viewer. Its global rule permits mock data through Phase 9 and puts real Users/Roles integration in Phase 10.
- No application code or database was changed during this audit. Existing untracked Phase 6/7 instruction files were left untouched.

## Overall status

**Phase 8 is a working-looking but mock-only prototype, not a complete or authoritative Users/Roles implementation.** The list, invite, lifecycle controls, permission matrix, and RLS viewer render and update client state only. The app separately has a genuinely persisted authentication user table and coarse, server-enforced role checks for other APIs; those do not back the Users page or its matrix. The live/mock boundary is not communicated, and `README.md` overstates the page as real.

Status labels below distinguish demo UI coverage from persistence/enforcement. Severity describes the gap/risk if the UI is relied upon as real.

| Roadmap requirement | Status | Evidence and concrete gap | Severity |
|---|---|---|---|
| Team member list | **Partial - mock UI** | `components/users/users-workspace.tsx` initializes from `teamMembers` in `lib/mock-data.ts`; rows are local React state. The authenticated account is not loaded from `protodb_admin.users`. No `/api/users` routes exist. The real user table is used by authentication only. | High: the displayed roster can differ from accounts that can sign in. |
| Invite flow | **Partial - mock UI** | `components/users/invite-modal.tsx` validates an email with a client regex and calls a local callback, which appends an `invited` fixture. There is no invitation record/token, email delivery, acceptance/password setup, expiry/revocation, duplicate check, or server authorization. `app/api/auth/login/route.ts` can activate an already-provisioned invited row after password login, but does not issue or redeem an invite. | High: the UI says “Send invite” without inviting anyone. |
| Owner/Admin/Editor/Viewer roles | **Partial** | Fixed role types and database `CHECK` constraints exist (`lib/auth/session.ts`, `migrations/001_protodb_admin_schema.sql`). Coarse roles are genuinely checked by API helpers/routes (see “Actually enforced”). The Users page role selector only changes local state; `TeamList` disables rows based on fixture role/self rather than server policy, and allows a non-Owner row to be promoted to Owner in the demo. No last-Owner/owner-count invariant exists. | High for authority/invariant gap; current UI changes are not persisted. |
| Per-resource permission matrix | **Partial - mock only** | `components/users/permission-matrix.tsx` cycles Editor/Viewer cells locally; Owner/Admin are fixed. `lib/mock-data.ts` has seven broad labels, not individual schemas, tables, or buckets. Nothing stores these settings or consults them in APIs. Levels (`full/edit/view/none`) do not map to the actual fixed guards: e.g. the sample says Editor can edit SQL and schema, while server routes restrict SQL and DDL to Owner/Admin. | High: displayed permission does not grant/restrict real access and conflicts with enforcement. |
| Suspend/reactivate/remove | **Partial** | `TeamList` invokes local callbacks; only removal has confirmation. There is no member mutation API or persistent change/audit event. Independently, authentication rejects suspended accounts in login and `getCurrentUser`; reactivation would make retained, unexpired sessions usable again. Deleting a user would cascade sessions per migration, but the page never deletes one. These auth behaviors are not wired to the controls. | High: controls imply access revocation/removal but do not perform it. |
| Read-only RLS policy viewer | **Partial - static fixture** | `components/users/rls-policy-viewer.tsx` renders `rlsStatus` from `lib/mock-data.ts`; it performs no catalog query and can neither establish actual RLS state nor show actual policies. Fixture expressions such as `auth.uid()`/`auth.role()` are not generic PostgreSQL built-ins. The view omits schema, policy roles, permissive/restrictive mode, `WITH CHECK`, and FORCE RLS. The “no policies ... every row is denied” text is not universally true for table owners or roles with `BYPASSRLS`. | High if treated as security evidence; otherwise demo-only. |
| Mock/live separation | **Missing** | `/users` requires `getCurrentUser()` (`app/users/page.tsx`) but then renders seeded roster/matrix/RLS data without a demo/live label, loading, or failure state. Unlike the Storage page, it has no mode distinction. With no configured DB there is no anonymous demo path; it redirects to login (or auth lookup may fail with a stale session). | High: real authentication context is mixed with fictional team and policy data. |
| Loading, empty, and error states | **Missing** | The Users components have no fetch, loading/error state, or `EmptyState`/`ErrorState`. An empty list/matrix/policy array renders an empty panel. Since today the fixtures are synchronous, no loading state exists; it becomes essential when wired to APIs. | Medium: failures/empty data could be mistaken for a valid configuration. |

## What is genuinely persisted/enforced today

- `migrations/001_protodb_admin_schema.sql` persists `protodb_admin.users` with unique email, a fixed-role check and `active/invited/suspended` status; sessions reference users with `ON DELETE CASCADE`. It has no invite-token, permission-override, or RLS-summary tables.
- `app/api/auth/setup/route.ts` creates the first Owner; `app/api/auth/login/route.ts` authenticates stored password hashes and blocks suspended users. Successful login activates a pre-existing invited user. `lib/auth/session.ts` reads role/status from PostgreSQL on each session lookup and denies suspended sessions. Role/status changes made directly to the DB therefore affect later requests, but there is no Phase 8 API that performs them.
- `lib/auth/authorization.ts` implements fixed app-wide checks: Owner/Admin for DDL and arbitrary SQL; Owner/Admin/Editor for table-data writes. Relevant protected routes include `app/api/database/tables/**`, `app/api/database/foreign-keys/route.ts`, and `app/api/queries/execute/route.ts`.
- Storage has a separate coarse policy in `lib/storage/policy.ts`: any active signed-in role can read; Owner/Admin/Editor can write; Owner/Admin can manage buckets. Storage routes enforce these helpers server-side. The Phase 8 matrix does not feed these checks.
- Most data reads are gated by signed-in session, but none apply per-schema/table/bucket permission overrides. These are application checks around a shared PostgreSQL connection, not PostgreSQL users/roles or per-user database credentials/RLS.

## Security, correctness, and documentation findings

1. **No server-authoritative user-management surface (High).** There are no `app/api/users/**` routes or member/permission/RLS services. All controls in `UsersWorkspace` can only alter the browser's local fixture state; no role, email, status, or resource permission sent from a client is validated or authorized server-side.
2. **Matrix is misleading (High).** `defaultPermissions` is illustrative, not policy. Its Editor SQL/schema “edit” values contradict `canExecuteSql`/`canManageSchema` (Owner/Admin only). The matrix also cannot express roadmap-level schema/table/bucket scoping.
3. **Client-only lifecycle safeguards (High).** Self/Owner controls in `TeamList` are UX only; current identity is inferred by matching the authenticated email against fixture members and falls back to the first fixture (`users-workspace.tsx`). For a non-seed account this marks the wrong row as “you.” A crafted request would have no Users API to protect, and future APIs must enforce self/Owner/last-Owner rules transactionally.
4. **Invite path is not connected to login (High).** The real `users.password_hash` is required and non-null. The mock Invite action creates no database user; login can only activate an invited user that already has a valid password hash. There is no one-time invite credential/acceptance or password enrollment path.
5. **RLS status may be misread as protection (High).** Fixture RLS rows are not target-database metadata or policy enforcement. A future viewer must report catalog state accurately, including schema-qualified table identity, policy roles, `USING` and `WITH CHECK`, permissive/restrictive policies, and RLS/Force-RLS flags. Do not present RLS viewer results as a replacement for the app's role checks.
6. **Owner bootstrap invariant (Medium, tightly related).** `app/api/auth/setup/route.ts` checks for zero users and inserts the Owner in separate operations; concurrent first-setup requests can race. The user schema does not enforce one/at-least-one Owner. This predates Phase 8 but must be accounted for before adding role/member mutations.
7. **Documentation overclaims live behavior (High).** `README.md` says `/users` has “all real state changes” and calls the permission matrix interactive without noting it is local-only. `ROADMAP.md` marks Phase 8 done, while its own Phase 10 progress says Users/Roles still need to read `protodb_admin.users` instead of the seed list. Correct the claim/status when implementation is approved.
8. **No Phase 8 verification coverage.** `tests/` contains Phase 5, 6, and 7 tests only. There are no tests for Users UI, role policies, member lifecycle, invitations, permission matrices, RLS rendering/catalog shape, or loading/empty/error behavior.

## Dependencies and blockers

- The official PDF named in the request and a separate project ZIP are absent from the repository tree. `ROADMAP.md` is the only available roadmap; obtain/compare the PDF before implementation if it is a distinct or newer specification.
- Existing Phase 10 foundation provides `DATABASE_URL`, `protodb_admin.users`, password hashing, sessions, and auth. Phase 8 documentation explicitly says reading the roster from that table is pending Phase 10. Do not silently expand this audit into new auth/database architecture.
- Real invite delivery/password enrollment needs an agreed invitation mechanism and possibly an email provider/configuration; none exists in the current codebase.
- Persisted resource overrides and actual RLS inspection require a defined storage/query model and a trusted target-PostgreSQL connection with catalog visibility. Current migrations have neither a permission matrix nor RLS metadata model. The configured DB role's catalog privileges and RLS bypass properties have not been runtime-verified; no database was queried or changed for this audit.
- The roadmap allows demo data through Phase 9, so a Phase 8 implementation can remain an honest, clearly labeled demo where persistence is not authorized. Do not label fixture controls as live or treat the matrix as security enforcement.

## Recommended implementation order

1. Confirm the official PDF matches `ROADMAP.md`; decide the Phase 8 live/demo boundary without pulling in unapproved Phase 10 scope.
2. Specify the four fixed roles' capability mapping and resource granularity (schema/table/bucket), and reconcile the matrix with the already enforced API checks. Keep one server-side policy source; explicitly define who can manage members and who may grant Owner.
3. Make the page's data mode explicit and correct the self identity. Preserve demo behavior only with a persistent banner/temporary-state notice; implement genuine API-backed behavior only within the approved Phase 10 boundary.
4. Implement and validate member role/status/remove operations server-side, including Owner/self/last-Owner constraints, session invalidation/revalidation, input validation, and audit events. Then connect UI actions and meaningful loading/empty/error/confirmation states.
5. Implement invitation issuance and acceptance as a complete flow, including expiring one-time credentials and password enrollment; don't create `invited` users with a fabricated password or rely on local email validation.
6. Implement resource-scoped permission storage and enforce it at every relevant API; migrate the matrix from illustrative labels to persisted, accurately named scopes.
7. Replace static RLS fixtures with read-only PostgreSQL catalog introspection and complete policy/RLS fields; clearly scope it to the selected target database and distinguish errors/insufficient metadata from “RLS disabled.”
8. Correct `README.md`/`ROADMAP.md` completion claims and add tests before marking Phase 8 complete.

## Verification plan

- Unit-test the fixed role/capability map and resource-scoped matching; include Owner/Admin/Editor/Viewer and active/invited/suspended behavior.
- API tests: unauthenticated `401`, unauthorized `403`, malformed/unknown inputs, duplicate invites/emails, attempts to self-promote, assign prohibited roles, demote/remove/suspend the last Owner, and failed operations leaving data unchanged.
- Integration tests against a disposable PostgreSQL database for role/status updates, session invalidation, invite expiry/replay/acceptance, and deletion/session cascade. Verify authorization on every relevant database, SQL, and Storage API, not only page visibility.
- RLS viewer tests with schema-qualified duplicate table names, no policies, `USING` and `WITH CHECK`, policy role/command/permissiveness, RLS enabled/forced, and catalog access errors. Compare viewer output with PostgreSQL catalogs; do not infer enforcement from rendered fixture text.
- UI/browser tests for labeled demo/live modes, role-appropriate actions, correct self identity, confirmations, keyboard/accessibility semantics, and loading/empty/error/retry states. Verify demo changes are explicitly temporary and never appear as persisted.
- Re-run TypeScript, lint/build, and existing Phase 5-7 tests after implementation; add focused Phase 8 tests rather than relying on those suites as proxy coverage.

## Final assessment

The repository contains the Phase 8 screens and mock interactions, plus a usable but coarse real authentication/role foundation. **The roadmap's Phase 8 workflow is not actually backed by member-management APIs, persisted per-resource permissions, or live RLS introspection.** Phase 8 should not be described as fully implemented or secure until these boundaries are made explicit and the relevant flows are either honestly demo-only or genuinely persisted and server-enforced.
