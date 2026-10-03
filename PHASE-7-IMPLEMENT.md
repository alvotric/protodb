\# ProtoDB — Phase 7 Storage Repair & Implementation

\## CURRENT BASELINE

Current committed baseline:

\`1ea1ef0\` — \`Phase 6 — SQL Editor repair\`

Phase 1–6 repair work must be preserved.

Do NOT rewrite or replace previous phases.

The current Storage implementation is a prototype/demo and does not have a real persistent object-storage backend.

The provider architecture decision for Phase 7 is:

\- S3-compatible object-storage interface

\- AWS S3 as the production reference provider

\- MinIO as the local-development/test provider

\- provider-specific SDK code behind a server-side adapter

\- object bytes stored in object storage

\- bucket/file metadata stored in PostgreSQL

The existing Storage UI should be reused and converted from mock/local state to real persistence.

\---

\# STEP 0 — SAFE WORKTREE CHECKPOINT

Before changing anything:

1\. Check \`git status\`.

2\. Review the current diff.

3\. Confirm there are no unexpected user changes.

4\. Do NOT discard, reset, revert, stash, overwrite, or silently remove existing changes.

5\. \`PHASE-7-AUDIT.md\`, \`PHASE-7-IMPLEMENT.md\`, and any other prompt/instruction files supplied by the user must NOT accidentally be included in the feature commit unless explicitly intended.

6\. If the worktree is clean except for prompt files, proceed.

7\. The previous Phase 6 commit must remain intact.

After implementation, the final Phase 7 feature changes will be committed separately.

\---

\# SOURCE OF TRUTH

Use these as the implementation basis:

1\. Current repository

2\. Official ProtoDB Admin Roadmap

3\. ProtoDB Phase 1–9 Gap & Repair Report

4\. The completed Phase 7 audit

5\. The approved S3-compatible + MinIO provider architecture

Rules:

\- repository = actual current implementation

\- roadmap = intended functionality

\- repair report = known project gaps and repair rules

\- audit = concrete current Phase 7 findings

\- provider architecture = approved storage design

Do not invent unrelated Phase 7 requirements.

\---

\# CRITICAL SCOPE

Implement ONLY:

\## Phase 7 — Storage

DO NOT implement:

\- Phase 8 Users/Roles/Permission Matrix

\- Phase 9 Audit/Monitoring UI

\- Phase 10 unrelated work

\- Phase 11 Production Readiness

\- unrelated refactors

Do not redesign the entire application.

Do not replace real PostgreSQL functionality.

Do not modify unrelated phases.

\---

\# PRIMARY GOAL

Convert the existing Storage prototype into a real persistent object-storage-backed feature.

The final live Storage flow should be:

UI

→ authenticated API

→ authorization

→ storage service

→ S3-compatible provider

→ PostgreSQL metadata

→ real persisted objects

The mock/demo path may remain for offline/demo use, but it must never be confused with live Storage.

\---

\# EXISTING STORAGE UI TO REUSE

Inspect and extend these existing components:

\- \`components/storage/storage-workspace.tsx\`

\- \`components/storage/bucket-card.tsx\`

\- \`components/storage/bucket-settings-modal.tsx\`

\- \`components/storage/file-browser.tsx\`

\- \`components/storage/file-preview-drawer.tsx\`

\- \`components/storage/file-icon.tsx\`

\- \`components/storage/storage-types.ts\`

Reuse existing shared UI components where appropriate:

\- \`Button\`

\- \`Input\`

\- \`Modal\`

\- \`Drawer\`

\- \`ConfirmDialog\`

\- \`EmptyState\`

\- \`ErrorState\`

Do NOT create a second competing Storage workspace.

\---

\# 1 — STORAGE PROVIDER ABSTRACTION

Create a narrow server-side provider interface.

The interface should cover the actual Phase 7 operations:

\- list buckets

\- create bucket

\- read bucket configuration where applicable

\- initiate upload

\- finalize/verify upload

\- list objects

\- retrieve object metadata

\- authorize download

\- authorize preview

\- delete object

\- rename metadata/object where required

\- calculate/retrieve usage inputs

\- provider health/configuration checks where practical

Keep provider-specific implementation behind the adapter.

Do NOT expose AWS SDK types directly to React components.

Do NOT expose storage SDK objects to browser code.

The UI/API contract should use application-level types.

\---

\# 2 — S3 / MINIO IMPLEMENTATION

Use the AWS SDK v3 for the S3-compatible integration.

Expected server-side dependencies:

\- \`@aws-sdk/client-s3\`

\- \`@aws-sdk/s3-request-presigner\`

Use these only if needed by the implementation.

Do not introduce additional storage libraries unnecessarily.

The adapter must support:

\## Production/reference

AWS S3-compatible configuration.

\## Development/test

MinIO using the same S3-compatible interface.

Support custom endpoints where necessary.

Do not hard-code provider URLs.

\---

\# 3 — ENVIRONMENT CONFIGURATION

Add/update \`.env.example\` with server-only configuration such as:

\- \`STORAGE\_PROVIDER\`

\- \`S3\_BUCKET\`

\- \`S3\_REGION\`

\- \`S3\_ENDPOINT\`

\- \`S3\_ACCESS\_KEY\_ID\`

\- \`S3\_SECRET\_ACCESS\_KEY\`

\- \`S3\_FORCE\_PATH\_STYLE\`

Use \`S3\_ENDPOINT\` for MinIO/S3-compatible providers where needed.

Do NOT use:

\`NEXT\_PUBLIC\_\*\`

for storage secrets.

Do not put actual credentials in source control.

Document which values are required for:

\- production

\- local MinIO

Where practical, support workload/IAM credentials in production instead of forcing long-lived static secrets.

\---

\# 4 — STORAGE DATABASE METADATA

Object storage contains file bytes.

PostgreSQL stores application metadata.

Create a narrowly scoped Phase 7 migration if required.

Do NOT store uploaded file bytes inside PostgreSQL.

At minimum define bucket metadata capable of storing:

\- stable ID

\- bucket name

\- display name if different

\- public/private state

\- size limit

\- created timestamp

\- updated timestamp

Object/file metadata should support:

\- stable ID

\- bucket ID

\- opaque provider storage key

\- display filename

\- folder/path metadata

\- MIME/content type

\- byte size

\- ETag/checksum where available

\- uploader/user ID

\- created timestamp

\- updated timestamp

Add appropriate indexes and foreign keys.

Keep ownership relationships explicit.

Do not put raw user filenames directly into storage keys.

\---

\# 5 — OBJECT KEY DESIGN

Do NOT use:

\`bucket/filename\`

as the raw provider key if that allows user-controlled path traversal or collisions.

Generate safe opaque storage keys.

For example, logically:

\- bucket identifier

\- generated object identifier

\- normalized internal path

The exact implementation may differ, but:

\- filenames remain metadata

\- provider keys are server-generated

\- path traversal is impossible

\- changing the display filename should not require physical object copying when avoidable

Do not use user-provided filenames as trusted filesystem/storage paths.

\---

\# 6 — AUTHENTICATION

Use the existing server-side session system.

Reuse:

\`getCurrentUser()\`

Never trust:

\- user ID from request body

\- owner ID from request body

\- bucket owner from client

\- client-provided role

\- client-provided privacy state

Every API operation must determine the authenticated user on the server.

\---

\# 7 — AUTHORIZATION

Implement Phase 7 storage authorization server-side.

At minimum secure:

\- bucket list

\- bucket create

\- bucket settings

\- object list

\- upload initiation

\- upload finalization

\- download

\- preview

\- rename

\- delete

\- bulk delete where supported

Use the existing Owner/Admin/Editor/Viewer roles carefully.

Do NOT implement Phase 8's full per-resource permission matrix.

A conservative Phase 7 policy is acceptable as long as it is:

\- explicit

\- server-enforced

\- documented

\- consistent

Frontend-only checks are NOT security.

\---

\# 8 — BUCKET CREATION

Implement real bucket creation if required by the Phase 7 roadmap.

Requirements:

\- validate bucket name

\- enforce safe naming rules

\- prevent duplicate logical names where required

\- create the provider bucket if the provider requires that operation

\- create metadata record

\- enforce authorization

\- audit operation

\- surface useful errors

\- avoid partial-success inconsistencies

Prefer a consistent strategy when provider creation succeeds but metadata creation fails.

Do not silently report success in a partial failure.

\---

\# 9 — BUCKET LIST

Replace mock bucket fixtures as the authoritative live source.

The live workspace should load real buckets through an API/service.

Display:

\- bucket name

\- public/private status

\- usage

\- size limit

\- file/object count if available

\- loading state

\- empty state

\- error state

Do not display synthetic fixture values in live mode.

\---

\# 10 — BUCKET SETTINGS

Persist real settings.

Support roadmap-relevant settings:

\- public/private

\- size limit

Make the distinction clear:

UI state

vs

persisted state

vs

actually enforced state

The provider/storage policy must respect persisted values.

Do NOT let the frontend toggle itself define security.

\---

\# 11 — PUBLIC / PRIVATE ACCESS

Private must be the safe default.

For private objects:

1\. authenticate

2\. authorize

3\. resolve metadata

4\. verify bucket/file access

5\. issue a short-lived scoped download/preview URL OR safely stream the object

For public logical buckets:

\- only allow access when the persisted bucket is public

\- use a deliberate server-side public-access path

\- do not rely on guessable provider URLs

\- do not expose unrestricted provider credentials

Do not assume that setting \`public = true\` in React is enough.

\---

\# 12 — UPLOAD

Implement real uploads.

Preferred design:

browser

→ server authenticated upload-init API

→ short-lived scoped presigned upload

→ object storage

→ server finalization/verification

→ PostgreSQL metadata

Requirements:

\- authentication

\- authorization

\- bucket validation

\- filename validation

\- content-type policy

\- maximum file-size policy

\- quota check

\- upload progress

\- upload failure handling

\- retry-friendly behavior

\- finalization

\- metadata persistence

\- cleanup of failed/incomplete uploads

\- duplicate/overwrite policy

Do not retain uploaded bytes only in React state.

Do not use browser memory as the persistent storage layer.

\---

\# 13 — UPLOAD SIZE AND MIME SAFETY

Enforce upload limits server-side.

At minimum:

\- maximum file size

\- allowed/accepted content types where the roadmap requires it

Do not treat browser-provided MIME type as a complete security validator.

Do not trust client-declared byte size as the only quota protection.

Where the provider/API design permits, verify final object metadata after upload.

\---

\# 14 — BUCKET QUOTA

The bucket size limit must be a real server-enforced constraint.

It must not simply control a visual progress bar.

Before upload:

\- calculate or reserve quota safely

\- prevent concurrent uploads from bypassing the limit

\- release reservation when upload fails

After successful upload:

\- finalize actual usage

After delete:

\- reduce usage appropriately

Do not silently allow uploads beyond the configured limit.

\---

\# 15 — FILE / OBJECT LISTING

Implement real object listing.

Requirements:

\- bucket selection

\- folder/path navigation

\- list view

\- grid view

\- search

\- pagination if needed at practical scale

\- object metadata

\- file size

\- type

\- updated time where available

\- loading

\- empty

\- error

\- permission denied

Do not load a huge bucket into browser memory unnecessarily.

\---

\# 16 — FOLDERS

Preserve the current UI's folder model, but make it safe and persistent where required.

Use metadata/path semantics that are provider-compatible.

Prevent:

\- \`..\`

\- absolute paths

\- traversal

\- unsafe path separators

\- hidden escapes

Do not accidentally treat folder names as filesystem paths on the server.

Implement nested folders only to the degree actually required by the roadmap.

Do not add unnecessary complexity.

\---

\# 17 — SEARCH

Search should operate on real persisted metadata.

At minimum:

\- filename

\- folder/path where appropriate

Do not search only the old mock array in live mode.

Handle:

\- no results

\- loading

\- errors

\---

\# 18 — DOWNLOAD

Implement real authorized downloads.

For private objects:

\- server-side authorization first

\- short-lived scoped signed URL OR safe server proxy/stream

For public buckets:

\- enforce persisted public policy

Do not expose long-lived storage credentials.

Do not expose unrestricted bucket listing URLs.

\---

\# 19 — PREVIEW

Support preview where safe:

\- images

\- text

\- JSON

Requirements:

\- retrieve real provider content

\- authorization

\- size limits

\- MIME handling

\- safe rendering

Do NOT render arbitrary HTML/script as executable content.

Text and JSON must remain data, not executable markup.

If a format is not safely previewable, provide a clear unsupported-preview state.

\---

\# 20 — LARGE PREVIEWS

Do not read arbitrarily large files fully into browser memory.

Set reasonable preview limits.

For oversized preview content:

\- refuse preview with a useful message

OR

\- use a bounded/safe partial-read strategy where supported

Do not allow preview to become a memory-exhaustion vector.

\---

\# 21 — RENAME

Implement persistent rename.

Requirements:

\- authenticate

\- authorize

\- validate new display name

\- reject traversal-like values

\- prevent invalid separators where appropriate

\- define duplicate/conflict policy

\- update persisted metadata

\- keep object key stable where practical

Do NOT require a copy/delete object operation merely to change the displayed filename unless the chosen provider/storage model genuinely requires it.

\---

\# 22 — DELETE

Implement real deletion.

Requirements:

\- server authorization

\- explicit UI confirmation

\- provider object deletion

\- metadata deletion/update

\- consistent failure handling

\- no false success

Single-file deletion must also have explicit confirmation.

Bulk deletion must:

\- confirm

\- authorize

\- process only selected authorized objects

\- report partial failure clearly where applicable

Do not add irreversible \`CASCADE\` behavior.

\---

\# 23 — FILE SELECTION

Fix the existing inconsistency:

Grid mode currently does not provide the same selection/bulk-action behavior as list mode.

Live Storage should have consistent selection semantics across views.

Support:

\- select

\- multi-select

\- bulk delete where roadmap requires it

Do not let selected state refer to stale/deleted objects.

\---

\# 24 — FILE PREVIEW DELETE CONFIRMATION

The existing preview drawer can delete immediately.

Change this for the real live implementation:

\- opening delete action

\- show explicit confirmation

\- show filename/object information

\- only execute after confirmation

\- surface backend errors

Do not use a frontend confirmation as the security boundary, but do use it as destructive-operation UX.

\---

\# 25 — USAGE

Storage usage must reflect real persisted objects.

Calculate usage from persisted object metadata.

Do not use the old synthetic fixture values in live mode.

Support:

\- total bytes

\- file/object count

\- bucket usage

\- limit percentage when a limit exists

Where practical, provide reconciliation with provider listings to detect drift/orphan objects.

Do not claim exact real-time telemetry if the value is cached or approximate.

\---

\# 26 — STORAGE API DESIGN

Create clean API routes under the existing Next.js API architecture.

Possible logical API group:

\- \`/api/storage/buckets\`

\- \`/api/storage/buckets/\[id\]\`

\- \`/api/storage/buckets/\[id\]/objects\`

\- \`/api/storage/upload\`

\- \`/api/storage/download\`

\- \`/api/storage/preview\`

\- \`/api/storage/objects/\[id\]\`

\- additional routes only when required

Exact route structure may follow existing project conventions.

Every mutating route must:

1\. authenticate

2\. authorize

3\. validate

4\. execute provider/database operation

5\. handle failure

6\. audit where appropriate

7\. return a structured response

Do not trust client authorization claims.

\---

\# 27 — STORAGE SERVICE LAYER

Keep business logic out of React components.

Recommended separation:

UI

→ API

→ storage application service

→ provider adapter

→ provider

And separately:

storage application service

→ PostgreSQL metadata service

Avoid scattering S3 operations throughout route handlers.

Avoid direct provider calls from React.

\---

\# 28 — TRANSACTION / CONSISTENCY RULES

Think carefully about operations crossing:

\- object storage

\- PostgreSQL metadata

These systems do not share a normal SQL transaction.

Implement explicit failure handling for cases such as:

\- provider upload succeeds but metadata insert fails

\- metadata insert succeeds but provider operation fails

\- delete succeeds in provider but metadata deletion fails

\- rename metadata succeeds but provider operation is still pending if applicable

Do not fake atomicity.

Document the chosen consistency strategy.

Use cleanup/reconciliation where practical.

\---

\# 29 — AUDIT LOGGING

Use the existing \`logAuditEvent()\` infrastructure for meaningful Storage mutations.

Audit at minimum where appropriate:

\- bucket create

\- bucket settings changes

\- upload

\- rename

\- delete

\- permission/access denial

\- relevant failures

Do NOT store:

\- storage secret keys

\- secret provider credentials

\- full file contents

Be careful about storing sensitive object names/paths.

Use safe metadata.

\---

\# 30 — MOCK / DEMO MODE

Keep the existing mock Storage implementation available for explicit demo/reference mode.

The old fixture source:

\`lib/mock-data.ts\`

must not remain the authoritative source when real Storage is configured.

Live mode:

\- real bucket API

\- real object API

\- real provider

\- real PostgreSQL metadata

Demo/offline mode:

\- clearly labelled

\- clearly non-persistent

\- clearly not real provider-backed storage

Do not allow silent fallback:

real Storage request fails

→ mock data

That would hide real backend failures.

\---

\# 31 — DEMO LABELING

Correct the current misleading UI/documentation.

When no storage provider is configured:

show something like:

\`Demo / Offline Storage\`

or another clearly equivalent label.

Do not present fixture usage or fixture objects as real.

When storage is configured:

show the live implementation.

\---

\# 32 — README

Update README to accurately describe Storage.

Do not claim:

\- persistent uploads

\- real usage

\- real object storage

unless the implementation actually provides them.

Document:

\- provider architecture

\- local MinIO setup

\- required environment variables

\- live/demo behavior

\- development requirements

Do not include real credentials.

\---

\# 33 — ERROR STATES

Implement clear errors for:

\- storage provider unavailable

\- bucket not found

\- object not found

\- permission denied

\- upload rejected

\- upload failed

\- quota exceeded

\- rename conflict

\- delete failure

\- preview unsupported

\- download failure

\- metadata failure

Do not silently return empty data when the backend failed.

\---

\# 34 — LOADING STATES

Support useful loading states for:

\- initial bucket load

\- object listing

\- search

\- upload initiation

\- upload progress

\- upload finalization

\- download authorization

\- rename

\- delete

\- bucket settings

Do not block the entire application unnecessarily for a local operation.

\---

\# 35 — EMPTY STATES

Support:

\- no buckets

\- empty bucket

\- empty folder

\- no search results

\- no files

\- no configured provider

Keep empty state distinct from backend error state.

\---

\# 36 — RETRY

Where practical, allow retry for recoverable failures:

\- bucket load

\- object load

\- provider/network errors

Do not automatically retry destructive operations.

\---

\# 37 — CLIENT OBJECT URL SAFETY

Demo/local preview may use temporary object URLs.

If so:

\- revoke object URLs at the correct lifecycle point

\- prevent memory leaks

\- do not revoke them prematurely before a download/preview can use them

Live mode should use actual provider-backed URLs/streams.

\---

\# 38 — STORAGE CREDENTIAL SECURITY

Verify that:

\- secrets never reach client bundles

\- provider SDK only runs server-side

\- API responses do not include secret keys

\- signed URLs are scoped and short-lived

\- bucket listing does not reveal credentials

\- environment configuration remains server-only

Search the client bundle/import graph if needed.

\---

\# 39 — DEPENDENCIES

Before installing anything:

\- verify whether the required S3 SDK is already present

\- only add necessary packages

\- use compatible versions

\- update \`package.json\` and \`package-lock.json\` consistently

Do not add unrelated packages.

\---

\# 40 — DATABASE MIGRATION

If Phase 7 needs metadata tables:

Create a narrowly scoped migration.

Do not:

\- modify unrelated existing migrations

\- change existing Phase 1–6 database structures unnecessarily

\- store file contents in PostgreSQL

The migration should be safe to review and apply independently.

Do not apply it automatically to the user's real database unless explicitly instructed.

\---

\# 41 — TESTS

Add focused Phase 7 tests.

At minimum cover:

\## Unit tests

\- bucket-name validation

\- filename validation

\- path traversal rejection

\- object-key generation

\- MIME policy

\- size policy

\- quota calculation

\- public/private authorization logic

\- metadata conversion

\- usage calculation

\## API/security tests

\- unauthenticated bucket access

\- unauthenticated object access

\- unauthorized role

\- cross-user object access

\- cross-bucket access

\- invalid path

\- invalid filename

\- oversized upload

\- quota exceeded

\- unauthorized rename

\- unauthorized delete

\## Provider tests

Use MinIO or another disposable S3-compatible environment.

Test:

\- bucket creation

\- upload

\- metadata finalization

\- listing

\- download

\- preview

\- rename

\- delete

\- usage

\- public/private handling

\- cleanup after failed operations

Never run destructive integration tests against real production storage.

\---

\# 42 — EXISTING PHASE 5 / PHASE 6 REGRESSION

Do not break previous repair work.

Run the existing test scripts, including:

\- Phase 5 tests

\- Phase 6 tests

Verify that:

\- Schema Designer still builds

\- SQL Editor still builds

\- auth/session code still works

\- shared DB functionality remains intact

\---

\# 43 — BUILD / LINT / TYPECHECK

Run:

\`\`\`text

npx tsc --noEmit

npm run lint

npm run build

git diff --check