\# ProtoDB — Phase 6 Commit + Phase 7 Deep Audit

\## STEP 1 — SAFELY COMMIT PHASE 6

The current Phase 6 implementation is complete for this repair pass.

Before doing anything else:

1\. Check \`git status\`.

2\. Review the complete diff.

3\. Confirm the modified files are Phase 6-related only.

4\. Do NOT discard, reset, revert, stash, overwrite, or silently remove existing changes.

5\. Keep these instruction files out of the Phase 6 commit unless they were intentionally added by the user:

\- \`PHASE-6-AUDIT.md\`

\- \`PHASE-6-IMPLEMENT.md\`

\- \`PHASE-7-AUDIT.md\`

6\. Create this Git commit:

\`Phase 6 — SQL Editor repair\`

7\. Confirm:

\- commit hash

\- working-tree status

\- files included in the commit

Do NOT:

\- apply migration \`002\_sql\_editor\_history.sql\` to the real application database

\- modify database data

\- modify database permissions

\- bypass authentication

\- guess credentials

The Phase 6 runtime environment previously lacked a legitimate authenticated Owner session. Treat that as a verification limitation, not as a reason to weaken security.

\---

\# STEP 2 — PHASE 7 DEEP AUDIT ONLY

After the Phase 6 commit succeeds, perform a deep audit of:

\*\*Phase 7 — Storage\*\*

Do NOT implement Phase 7 yet.

The audit must use:

1\. the current repository at the new Phase 6 commit

2\. the official ProtoDB Admin Roadmap

3\. the ProtoDB Phase 1–9 Gap & Repair Report

Source-of-truth rules:

\- Current repository = what is actually implemented

\- Official roadmap = intended Phase 7 requirements

\- Gap & Repair Report = known project gaps and repair guidance

Do not invent requirements that are not supported by these sources.

\---

\# IMPORTANT SCOPE

During this audit:

\- Do NOT modify Phase 7 code.

\- Do NOT create/delete/rename project files except temporary read-only analysis artifacts if absolutely necessary.

\- Do NOT modify database data.

\- Do NOT modify storage data.

\- Do NOT apply database/storage migrations.

\- Do NOT install dependencies.

\- Do NOT start Phase 8.

\- Do NOT start Phase 9.

\- Do NOT start Phase 10.

\- Do NOT start Phase 11.

\- Do NOT refactor unrelated architecture.

\- Do NOT implement any fix yet.

This is an AUDIT ONLY.

\---

\# PHASE 7 — COMPLETE STORAGE INSPECTION

Inspect the full Storage implementation and trace:

UI

→ state/hooks

→ API routes

→ service layer

→ storage backend

→ persistence

Inspect all relevant files and paths, including where applicable:

\- Storage page

\- Storage workspace

\- bucket list

\- bucket creation

\- bucket editing

\- bucket settings

\- public/private setting

\- limits

\- usage display

\- file/folder tree

\- file list

\- grid/list view

\- search

\- upload

\- download

\- delete

\- rename

\- preview

\- folder operations

\- API routes

\- storage services

\- storage configuration

\- environment variables

\- authentication

\- authorization

\- destructive-operation confirmation

\- loading state

\- empty state

\- error state

\- retry behavior

\- persistence

\- mock/demo data

\- local React state

\- in-memory storage

\- browser-only storage

\- duplicate live/demo implementations

\---

\# VERIFY THE REAL STORAGE BACKEND

The earlier repair audit suggested that Phase 7 is currently mock/in-memory.

Do NOT assume this is still true.

Inspect the current repository and determine exactly:

\- Is there a real storage backend?

\- What backend is configured?

\- Is it PostgreSQL-only?

\- Is it filesystem-based?

\- Is it object storage?

\- Is it browser/local state?

\- Is it purely mock data?

\- Is there a service abstraction without a real provider?

\- Are uploads actually persisted?

Identify the exact implementation and configuration.

If there is NO real storage backend, state this explicitly.

Do NOT pretend that:

\- React state

\- localStorage

\- browser memory

\- fake URLs

\- static mock files

are a real persistent storage backend.

\---

\# ROADMAP REQUIREMENT AUDIT

Read every Phase 7 requirement in the official roadmap and compare it with the current repository.

For EVERY roadmap requirement classify it as exactly one:

\- Implemented

\- Partially implemented

\- Missing

\- Incorrect/Buggy

\- Mocked

Do not combine categories.

For every non-complete item provide:

\### File

Exact file path.

\### Code location

Exact component/function/API/service.

\### Current behavior

What the code actually does today.

\### Roadmap requirement

What Phase 7 requires.

\### Gap

What is missing/wrong.

\### Needed implementation

What would have to change later.

\### Reusable code

Which existing component/service/API should be reused.

\### Risk

Security, persistence, data-integrity, or operational risk.

\---

\# STORAGE SECURITY AUDIT

Inspect server-side security carefully.

Pay particular attention to:

\- authentication

\- authorization

\- bucket ownership

\- bucket access

\- file ownership

\- public/private exposure

\- object/path traversal

\- unsafe filenames

\- directory traversal

\- arbitrary path input

\- upload size limits

\- content-type validation

\- file extension validation

\- signed URL handling

\- download authorization

\- rename authorization

\- delete authorization

\- bucket deletion if present

\- server-side enforcement

\- sensitive file exposure

\- leakage of storage credentials

\- client exposure of secret storage keys

\- destructive-operation confirmation

Important:

Frontend UI restrictions are NOT a security boundary.

Disabled buttons, hidden buttons, or React checks do not count as server-side authorization.

\---

\# PERSISTENCE AUDIT

Determine whether Storage operations really persist.

Verify from code whether:

\- uploaded files survive page reload

\- uploaded files survive server restart

\- renamed files retain their new names

\- deleted files are actually gone

\- folders persist

\- bucket settings persist

\- public/private settings persist

\- storage usage reflects actual stored objects

\- file metadata persists

\- downloads retrieve the actual stored object

\- previews retrieve actual stored content

\- mock state is accidentally shown as real persistence

If the roadmap expects persistence, clearly identify anything that only exists in component/browser state.

\---

\# UPLOAD AUDIT

Inspect the upload flow end-to-end.

Determine:

\- where the uploaded bytes actually go

\- whether upload is real or simulated

\- maximum file size

\- allowed file types

\- filename normalization

\- path validation

\- overwrite behavior

\- duplicate-name behavior

\- progress behavior

\- failure handling

\- cleanup after failed upload

\- authorization

\- storage credentials/security

Do not execute real destructive upload/delete operations during this audit.

\---

\# DOWNLOAD / PREVIEW AUDIT

Determine:

\- whether downloads return actual stored bytes

\- whether users can download files they should not access

\- whether preview is reading real content

\- whether preview can expose sensitive content

\- whether generated URLs are safe

\- whether signed URLs expire appropriately if such a mechanism exists

\---

\# DELETE / RENAME AUDIT

Inspect:

\- single-file delete

\- bulk delete if present

\- rename

\- folder delete

\- bucket delete if present

For every destructive operation determine:

\- server-side authorization

\- confirmation behavior

\- backend enforcement

\- accidental deletion risks

\- whether deletion is real

\- whether deletion is reversible

\- whether dependencies/references exist

Do NOT add or execute destructive operations during the audit.

\---

\# BUCKET SETTINGS AUDIT

Inspect support for:

\- bucket creation

\- bucket naming

\- public/private

\- limits

\- allowed MIME types if present

\- size limits

\- persistence

\- authorization

Clearly distinguish:

UI-only setting

vs

persisted backend setting

vs

actually enforced backend setting.

\---

\# USAGE / METRICS AUDIT

Determine whether displayed storage usage is:

\- real

\- calculated from actual stored objects

\- static

\- mock

\- estimated

\- stale

\- client-side

Do not treat a hard-coded storage number as real telemetry.

\---

\# MOCK VS LIVE AUDIT

Find every Storage-related mock/demo implementation.

Classify each as:

\- live

\- demo/reference

\- dead/unused

Look specifically for patterns such as:

\- \`storageBuckets\`

\- \`storageFiles\`

\- seed data

\- \`useState(...)\` used as the storage source

\- fake upload functions

\- fake download URLs

\- fake delete

\- fake rename

\- mock usage numbers

\- static bucket settings

Determine whether the app can accidentally display mock Storage data as though it were real.

If the app has both demo and live paths, identify exactly how the active path is selected.

\---

\# LOADING / EMPTY / ERROR STATES

Audit:

\- initial loading

\- bucket loading

\- file loading

\- upload progress

\- upload failure

\- download failure

\- delete failure

\- rename failure

\- search with no results

\- empty bucket

\- empty storage system

\- unavailable storage backend

\- permission denied

\- retry behavior

Do NOT count a generic console error as a proper UX error state.

\---

\# ENVIRONMENT / CONFIGURATION AUDIT

Inspect:

\- \`.env.example\`

\- README

\- environment variable usage

\- storage provider configuration

\- missing required secrets

\- server-only vs client-exposed variables

Identify exactly what environment configuration would be necessary for real Storage.

Do not expose actual secret values in the audit report.

\---

\# TESTING AUDIT

Inspect:

\- \`package.json\`

\- test scripts

\- existing test files

\- existing testing conventions

Determine:

1\. What Phase 7 unit tests should exist.

2\. What API/security tests should exist.

3\. What real-storage integration tests should exist.

4\. What requires a disposable storage backend.

5\. What cannot safely be tested in the current environment.

Do NOT create tests yet.

Do NOT modify existing tests.

\---

\# DUPLICATE / DEAD CODE AUDIT

Identify:

\- duplicate Storage workspaces

\- old mock Storage components

\- unused services

\- unused API routes

\- competing implementations

\- misleading imports

\- demo code accidentally reachable from live mode

Do not delete anything during the audit.

\---

\# RECOMMENDED IMPLEMENTATION ORDER

At the end, recommend an implementation order based on dependency and safety, not arbitrary file order.

Prioritize things such as:

1\. choosing/confirming the real storage backend

2\. storage configuration/abstraction

3\. server-side authentication/authorization

4\. bucket persistence

5\. actual upload/download/delete/rename

6\. public/private enforcement

7\. usage calculation

8\. UI wiring

9\. loading/error/empty states

10\. security hardening

11\. integration tests

Only include these if the actual repository/roadmap requires them.

\---

\# FINAL OUTPUT

Return EXACTLY this structure:

\# PHASE 7 AUDIT REPORT

\## A. Overall Phase 7 status

\## B. Implemented

\## C. Partially implemented

\## D. Missing

\## E. Incorrect/Buggy

\## F. Mocked/Demo-only

\## G. Exact files likely requiring changes

\## H. Existing services/components to reuse

\## I. Real storage backend status

\## J. Authentication/authorization risks

\## K. Storage security risks

\## L. Persistence/data-integrity risks

\## M. Upload/download/delete/rename risks

\## N. Bucket-settings and usage gaps

\## O. Mock-vs-live conflicts

\## P. Testing gaps and recommended tests

\## Q. Recommended implementation order

\## R. Environment blockers

\## S. Confirmation that NO Phase 7 code was modified during this audit

Then STOP.

Do not implement Phase 7 until I explicitly approve the audit.

Do not start Phase 8 or any later phase.