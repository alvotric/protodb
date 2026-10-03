\# PHASE 8 — USERS, ROLES & PERMISSIONS IMPLEMENTATION

You are implementing \*\*Phase 8 only\*\* in the current ProtoDB Admin repository.

\## Authoritative inputs

Use these sources as the basis for the work:

1\. The checked-in \`ROADMAP.md\`.

2\. The completed \`PHASE-8-AUDIT.md\`.

3\. The current codebase at Phase 7 baseline:

\`c093b33261501b04998947cc743d462a44095753\`

4\. Existing Phase 6 baseline:

\`1ea1ef0b62b93829a1b74a059a335ae59ca4d8e9\`

The official \`ProtoDB-Admin-Roadmap.pdf\` was not found inside the repository during the audit. Do not invent requirements that are absent from the available roadmap/audit.

\---

\# 1. PHASE BOUNDARY — IMPORTANT

Phase 8 must be implemented \*\*without silently expanding Phase 10\*\*.

The roadmap explicitly permits mock/demo data through Phase 9 and identifies real Users/Roles integration as a Phase 10 responsibility.

Therefore:

\- Do not turn the Users/Roles page into a fake "live" system.

\- Do not claim that client-side demo mutations are persisted.

\- Do not invent an email provider or production invitation delivery system.

\- Do not invent database permission tables solely to make the UI appear live.

\- Do not replace the existing authentication architecture.

\- Do not add PostgreSQL user/role management or database-level RLS enforcement as a substitute for the roadmap.

\- Do not modify production database data.

\- Do not modify database permissions.

\- Do not start Phase 9.

\- Do not perform unrelated refactors.

Where the roadmap intentionally leaves functionality mocked until Phase 10, make the UI and documentation \*\*explicitly and honestly demo-only\*\*.

However, existing real authentication/session/authorization foundations must remain correct and must not be contradicted by the Phase 8 UI.

\---

\# 2. PRIMARY GOAL

Repair the Phase 8 Users/Roles experience so that it is:

\- faithful to the roadmap,

\- explicit about demo/mock behavior,

\- internally consistent with the existing server-side role rules,

\- structurally ready for future Phase 10 live wiring,

\- safe against misleading permission claims,

\- complete in its loading/empty/error/confirmation states,

\- accessible and understandable,

\- free of client-side claims that imply security enforcement.

Do not merely cosmetically rename labels. Fix the underlying client-side model and component contracts where necessary.

\---

\# 3. REQUIRED PHASE 8 COVERAGE

The repaired Phase 8 experience must clearly cover these roadmap areas:

\## A. Team members

Maintain the team-member experience with:

\- member list/table,

\- role display,

\- status display,

\- current-user identification,

\- role controls,

\- lifecycle controls,

\- clear empty state,

\- loading state,

\- error state where a data source can fail,

\- confirmations for destructive actions.

Because this remains demo-mode during Phase 8, make that boundary explicit.

The current "self" identity must NOT be inferred by matching the authenticated user's email against an unrelated fixture list and then falling back to the first fixture.

Create one clear source of truth for the demo current-user identity.

Do not present a fictional seed user as the real authenticated account.

\---

\# 4. FIXED ROLES AND CAPABILITIES

The four fixed roles are:

\- Owner

\- Admin

\- Editor

\- Viewer

Create or centralize a single capability description/mapping for these fixed roles.

The mapping must agree with the server-side authorization that already exists.

In particular, do not display a permission matrix suggesting that Editor can perform actions that current server guards reserve for Owner/Admin, such as arbitrary SQL execution or schema DDL.

At minimum, reconcile the UI description of:

\- SQL execution,

\- schema/DDL management,

\- table-data writes,

\- storage read,

\- storage write,

\- storage/bucket management.

Do not create a second contradictory policy model.

The Phase 8 UI may describe capabilities, but it must clearly distinguish:

\- role/capability documentation,

\- resource-scoped demo permissions,

\- actual server-enforced permissions.

Never imply that the UI matrix itself provides security.

\---

\# 5. PER-RESOURCE PERMISSION MATRIX

The roadmap calls for per-resource permissions for:

\- schemas,

\- tables,

\- buckets.

Repair the existing matrix model so it represents \*\*resource-scoped demo permissions\*\*, rather than seven vague broad labels.

The model should be structured so a future Phase 10 backend can replace the data source without redesigning the entire UI.

Use explicit concepts such as:

\- resource type,

\- resource identifier/name,

\- member,

\- role,

\- permission level.

Preserve the existing UI design language where practical.

Permission levels can remain the existing conceptual levels (for example full/edit/view/none) only where they make sense, but do not invent security semantics that are not supported by the roadmap.

The matrix must visibly state that these Phase 8 changes are demonstration state and are not persisted or enforced server-side yet.

Do not create fake API success messages.

When a user changes a demo permission, show that it changed in local/demo state only.

\---

\# 6. TEAM MEMBER ROLE/LIFECYCLE CONTROLS

Repair the role and lifecycle controls so their behavior is internally correct even while demo-only.

Support:

\- role selection,

\- suspend,

\- reactivate,

\- remove,

\- confirmation for destructive actions,

\- appropriate disabling for self/Owner-sensitive actions.

At minimum, client-side demo rules must prevent obviously invalid states such as:

\- self-removal,

\- self-demotion where prohibited by the existing UX contract,

\- unauthorized Owner promotion through a casual row selector,

\- removing or demoting the final remaining Owner.

These are \*\*UX/demo safeguards only\*\* in Phase 8.

Do not describe them as security enforcement.

Do not add a false "server validated" result.

Create clear feedback for successful demo-state changes and cancelled/failed operations.

\---

\# 7. INVITE FLOW — PHASE 8 DEMO-SAFE BEHAVIOR

The current invite modal only appends a local fixture.

Keep the Phase 8 invitation flow honest.

Implement a demo invitation experience that:

\- validates email format,

\- requires an explicit role,

\- prevents obvious duplicate demo invitations,

\- shows a clear "Demo" / non-persisted state,

\- does not claim that an email was actually sent,

\- does not create a fake database user,

\- does not create a fabricated password hash,

\- does not pretend to have issued a real token.

The result should communicate something like:

"Demo invitation created locally — not persisted or sent."

Use the app's existing UI language rather than blindly copying that sentence if a better equivalent fits.

Do not integrate an email provider in Phase 8.

Do not build a production invitation-token/password-enrollment system unless the available roadmap explicitly requires it here.

\---

\# 8. RLS POLICY VIEWER

Repair the RLS viewer so its demo nature is obvious.

The viewer must remain read-only.

Improve the displayed model to reflect the fields a real PostgreSQL policy viewer would eventually need, where the current fixture structure can support it:

\- schema,

\- table,

\- policy name,

\- command,

\- policy role(s),

\- permissive/restrictive mode,

\- \`USING\`,

\- \`WITH CHECK\`,

\- RLS enabled,

\- FORCE RLS.

Do not claim these are live PostgreSQL catalog results.

Do not use misleading statements such as "every row is denied" as a universal PostgreSQL conclusion.

Prefer precise demo wording such as:

\- sample policy,

\- demo RLS state,

\- not queried from the target database.

Do not implement live catalog introspection in Phase 8 unless it is already explicitly part of the current roadmap boundary.

\---

\# 9. MOCK/LIVE SEPARATION

This is one of the highest-priority repairs.

The \`/users\` page currently mixes real authentication with fictional Users data.

Fix this.

The page should clearly communicate the current mode, for example:

\- "Demo Users & Roles"

\- "Phase 8 demo data"

\- "Changes are local to this session and are not persisted"

Use the existing design system/components where possible.

Do not make the warning visually overwhelming, but it must be unmistakable.

The page must not imply:

\- the member list is the actual database roster,

\- invites are actually sent,

\- role changes are actually persisted,

\- permissions are actually enforced,

\- RLS data is actually from PostgreSQL.

The authenticated session may continue to control access to the page, but the fictional demo roster must not be presented as the authenticated database's real team.

\---

\# 10. LOADING / EMPTY / ERROR STATES

Add proper state handling.

At minimum, cover:

\- loading,

\- empty team list,

\- empty permission matrix,

\- no RLS policies,

\- recoverable UI/data errors,

\- retry or reset action where applicable.

Use the existing \`EmptyState\`, \`ErrorState\`, skeleton/loading, dialog, or equivalent shared components already present in the project.

Do not leave an empty panel where a user could interpret "no data" as "configured and empty".

In demo mode, these states can be driven by demo state/configuration.

\---

\# 11. DATA MODEL / COMPONENT ARCHITECTURE

Refactor only as needed to establish clean boundaries.

Prefer a structure where future Phase 10 wiring could replace:

\`demo data -> real API/service\`

without rewriting:

\- TeamList,

\- InviteModal,

\- PermissionMatrix,

\- RLS viewer,

\- UsersWorkspace.

Separate these concepts cleanly:

1\. current authenticated session identity,

2\. demo team/member data,

3\. demo invitation state,

4\. demo resource permissions,

5\. demo RLS catalog/state,

6\. fixed role capability definitions.

Avoid scattered literals for roles, statuses, and permission names.

Do not create duplicate sources of truth.

\---

\# 12. EXISTING REAL AUTHORIZATION — DO NOT BREAK IT

Preserve the existing real authorization rules.

The audit identified real server-side authorization already used by other APIs.

The Phase 8 UI must not contradict them.

In particular, do not change existing semantics for:

\- \`canExecuteSql\`,

\- \`canManageSchema\`,

\- \`canMutateTableData\`,

\- Storage read/write/management guards.

Do not weaken authorization to make the Phase 8 matrix appear to work.

Do not let demo UI state influence the real security guards.

\---

\# 13. DOCUMENTATION

Correct inaccurate documentation caused by the existing Users/Roles prototype.

Review:

\- \`README.md\`

\- \`ROADMAP.md\`

\- \`/users\` related documentation/comments

Remove or rewrite claims that imply:

\- Users page has real persisted state changes,

\- permission matrix is live security enforcement,

\- invites are actually sent,

\- RLS viewer is querying the target database.

Use wording consistent with the roadmap:

Phase 8 = Users/Roles interface and workflow prototype with demo/mock state where the roadmap allows it.

Do not incorrectly mark Phase 10 work as complete.

Do not mark the entire roadmap complete.

\---

\# 14. TESTING

Add focused Phase 8 tests.

Do not rely only on TypeScript/build success.

At minimum test:

\## Role capability tests

Cover:

\- Owner

\- Admin

\- Editor

\- Viewer

Verify the centralized capability map matches the UI expectations.

Specifically prevent the UI from claiming Editor has SQL/DDL permissions that server guards reserve for Owner/Admin.

\## Demo member lifecycle tests

Cover:

\- suspend,

\- reactivate,

\- remove,

\- invalid self actions,

\- last Owner protection.

\## Invitation tests

Cover:

\- valid email,

\- invalid email,

\- duplicate demo invitation,

\- required role,

\- demo-only result semantics.

\## Permission matrix tests

Cover:

\- schema scope,

\- table scope,

\- bucket scope,

\- member/resource association,

\- supported permission levels,

\- demo-state mutation only.

\## RLS viewer tests

Cover:

\- schema-qualified table identity,

\- policies with \`USING\`,

\- policies with \`WITH CHECK\`,

\- policy command,

\- policy roles,

\- permissive/restrictive mode,

\- enabled/forced RLS state,

\- no-policy state.

\## UI-state tests

Cover:

\- loading,

\- empty,

\- error,

\- retry/reset,

\- demo/live labeling,

\- correct current-user identity.

Do not add tests that pretend Phase 8 is using live database member APIs when it is not.

\---

\# 15. VERIFICATION

After implementation, run:

1\. \`npx tsc --noEmit\`

2\. existing Phase 5 tests

3\. existing Phase 6 tests

4\. existing Phase 7 tests

5\. new Phase 8 tests

6\. \`npm run lint\`

7\. \`npm run build\`

8\. \`git diff --check\`

If a command fails, diagnose and fix only relevant issues.

Do not hide failures.

Do not claim runtime verification against PostgreSQL unless it was actually performed.

\---

\# 16. GIT / FILE SAFETY

Do not commit anything automatically.

Do not stage anything automatically.

Do not modify:

\- database data,

\- production storage data,

\- database permissions,

\- secrets,

\- \`.env\` files containing real credentials.

Keep existing instruction files out of feature changes:

\- \`PHASE-6-AUDIT.md\`

\- \`PHASE-6-IMPLEMENT.md\`

\- \`PHASE-7-AUDIT.md\`

\- \`PHASE-7-IMPLEMENT.md\`

\- \`PHASE-8-AUDIT.md\`

\- \`PHASE-8-IMPLEMENT.md\`

Do not delete those files.

\---

\# 17. FINAL IMPLEMENTATION REPORT

At the end, report:

\## Changed

List the exact files changed and what each change accomplished.

\## Phase 8 coverage

For each roadmap area:

\- team members,

\- invite,

\- roles,

\- resource permission matrix,

\- suspend/reactivate/remove,

\- RLS viewer,

\- mock/live separation,

\- loading/empty/error states,

state exactly what is now implemented.

\## Explicitly still deferred to Phase 10

List anything that remains intentionally non-live.

\## Tests

Report exact counts/results.

\## Verification

Report:

\- TypeScript,

\- lint,

\- build,

\- diff check,

\- existing Phase 5 tests,

\- existing Phase 6 tests,

\- existing Phase 7 tests,

\- new Phase 8 tests.

\## Runtime limitations

Clearly state anything that could not be verified because credentials/database/provider/runtime environment were unavailable.

\## Git

Report:

\- current HEAD,

\- worktree clean/dirty,

\- files changed.

Do not create a commit.

\---

\# 18. STOP CONDITIONS

Stop immediately and report before making a change if you discover that implementing a requested feature would require:

\- a new external email provider,

\- production invitation delivery,

\- a new authentication architecture,

\- database permission/role administration,

\- irreversible database migrations outside the roadmap,

\- real RLS enforcement rather than read-only viewing,

\- changing Phase 6 or Phase 7 security semantics,

\- starting Phase 9 or Phase 10.

Do not silently cross the phase boundary.

The goal is a \*\*correct, honest, internally consistent Phase 8 implementation\*\*, not a fake "fully live" Users/Roles system.