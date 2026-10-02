# ProtoDB Admin — Phase 10: Backend API & Real Data Integration

Standalone frontend for a private PostgreSQL admin platform. See
**[ROADMAP.md](./ROADMAP.md)** for the full 11-phase plan — the
authoritative scope reference from here on.

Phase 10 replaces Phase 1–9 mock data with real PostgreSQL-backed
features incrementally. The current implementation includes database
connectivity, authentication, Dashboard stats, the Database Explorer/
Table View, the Schema Designer, and the SQL Editor.

## Setup (new in Phase 10)

```bash
cp .env.example .env.local   # then fill in DATABASE_URL
psql "$DATABASE_URL" -f migrations/001_protodb_admin_schema.sql
psql "$DATABASE_URL" -f migrations/002_sql_editor_history.sql
psql "$DATABASE_URL" -f migrations/003_storage_metadata.sql
npm install
npm run dev
```

Visit the app — since a fresh database has no users yet, you'll be
walked through creating the first admin account (it becomes Owner).
Without `DATABASE_URL` set, the app still runs: every Phase 1–9 route
remains clearly labeled demo/reference data where authentication is
not required.

Then open http://localhost:3000 — it redirects to `/dashboard` (or
`/login` first, if you're not signed in).

## What's here

- **`/database`** — Phases 3–5's real deliverable, two whole-page
  views (switch via the tabs at the top):
  - **Live Database** (Phases 3–4): real schema/table discovery,
    per-table structure, and a paginated PostgreSQL data grid with
    type-aware edits, multi-clause filters, row creation/update/delete,
    bulk delete, visibility/resize/reorder controls, and a row-detail
    drawer. Writes are authenticated, role-checked, validated, and
    audited.
  - **Explorer (demo)**: the original mock schema/table tree and
    Phase 4 grid remain available as an explicit preview.
  - **Live Schema** (Phase 5): real PostgreSQL tables as draggable,
    schema-qualified nodes with pan, zoom, auto-layout, and browser-
    persisted positions. Foreign-key edges include ordered composite
    column mappings and open an inspector; Owner/Admin users can create,
    edit, and remove supported constraints and column definitions.
  - **Schema (demo)**: the original mock canvas remains available as a
    clearly labeled reference and never substitutes for the live view.
  The connected Live Database view uses real PostgreSQL data; the
  demo view uses the fixed mock row sets. The Schema Diagram remains
  a separate Phase 5 feature.
- **`/dashboard`** — Phase 2's real deliverable, now backed by real
  data (Phase 10): cache hit ratio, active connections, and database
  size come directly from Postgres's own system catalogs. Quick
  actions, recent activity, and the tables overview below are still
  Phase 1–9 mock data pending their own turn.
- **`/components`** — Phase 1's deliverable. Every reusable component
  (buttons, badges, inputs, switch, tabs, cards, table, tooltip,
  modal, drawer, confirm dialog, command palette) shown with mock
  data, including loading/empty/error states you can toggle live.
- **`/queries`** — Phase 6's PostgreSQL-backed SQL workspace. It
  supports one statement per run, with a 10-second statement timeout,
  a 500-row / 1 MB result cap, and at most three concurrent executions
  per server process. Only signed-in Owner/Admin users may execute SQL;
  PostgreSQL privileges remain the final database boundary. Successful
  statements commit; failed statements roll back. Apply migration 002
  to enable per-user history (latest 100 runs); saved queries use
  `protodb_admin.saved_queries` (up to 200 per account). Query history retains SQL text for the
  owning user, so avoid embedding secrets in submitted SQL. The audit
  log records execution status and timing metadata, not raw SQL.
  Autocomplete uses metadata visible to the configured PostgreSQL
  connection. When the database is unavailable, the workspace labels
  itself as demo mode and the restricted simulator rejects unsupported
  query shapes instead of presenting unfiltered results as valid.
- **`/storage`** — Phase 7 uses a server-only S3-compatible provider
  (AWS S3 reference; MinIO for local development) for object bytes and
  PostgreSQL for logical buckets, object metadata, and upload quota
  reservations. The configured physical S3 bucket is private; logical
  buckets are application metadata, not separate provider buckets.
  Owner/Admin users create buckets and change visibility/limits;
  Owner/Admin/Editor users upload, rename, and delete; all signed-in
  roles can list and download. Private objects require an authenticated
  app API request before a short-lived download URL is issued. Public
  logical buckets use an app route that checks persisted visibility
  before redirecting to a short-lived URL. No storage provider
  configuration means clearly labeled temporary demo data; partial or
  invalid live configuration shows an error and does not fall back to
  fixtures. Apply migration 003 before using live Storage.

### Storage configuration

Set `STORAGE_PROVIDER=s3`, `S3_BUCKET`, and `S3_REGION` for live
storage. On AWS, leave `S3_ACCESS_KEY_ID` and
`S3_SECRET_ACCESS_KEY` unset when the server has a least-privilege IAM
role. For MinIO or another custom endpoint, set `S3_ENDPOINT`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and
`S3_FORCE_PATH_STYLE=true`. These variables are server-only; never
prefix them with `NEXT_PUBLIC_`.

For local MinIO, run the MinIO server separately (for example, using
the official MinIO container with a persistent local volume), create
the physical bucket once in its console, then point the app at
`http://127.0.0.1:9000`. Use disposable local credentials and data.
Configure the physical bucket CORS policy to permit the app origin's
presigned `POST` uploads. In production, pre-create the private
physical bucket and grant the app identity only the required bucket
listing, object `GetObject`, `PutObject`, and `DeleteObject` operations;
do not enable public ACLs or broad anonymous bucket access. The app
does not create or change physical provider buckets.

Uploads use short-lived presigned POST policies with an enforced
declared-size ceiling, then verify provider object metadata before
committing PostgreSQL metadata. PostgreSQL reserves the requested size
under a per-bucket transaction lock to prevent concurrent uploads from
exceeding configured limits. Expired incomplete uploads are cleaned up
opportunistically during bucket listing. Usage comes from verified
object metadata and can temporarily reflect cleanup/reconciliation
work; it is not provider billing telemetry. If an upload succeeds at
the provider but metadata finalization fails, the UI reports the
failure and attempts cleanup; expired reservations provide a later
cleanup path. Objects whose provider deletion or metadata removal
fails stay hidden from listings and are retried during later bucket
loads.

Run `npm run test:phase7` for focused Storage policy/configuration
tests. Its S3-compatible lifecycle test is skipped unless
`STORAGE_TEST_DISPOSABLE=true` and all `STORAGE_TEST_*` values are set.
That test requires a pre-created, dedicated test bucket containing
`test` in its name and a loopback MinIO endpoint; it refuses remote
endpoints and deletes only the uniquely named test object it creates.
- **`/users`** — Phase 8's real deliverable: a team member list
  (invite, change role, suspend/reactivate, remove — all real state
  changes), an interactive per-resource permission matrix (Owner/Admin
  fixed, Editor/Viewer adjustable — click a pill to cycle Full → Edit
  → View → None), and a read-only row-level security policy viewer
  shaped like a real `pg_policies` summary.
- **`/audit`** — Phase 9's real deliverable (audit half): a
  searchable/filterable audit trail (actor, action, resource, result)
  and a System Health view (connection pool, error rate with
  sparklines, slow query log).
- **`/settings`** — Phase 9's real deliverable (settings half):
  profile, notification preferences (event type × in-app/email), and
  a danger zone. No external alerting integrations (Slack/PagerDuty)
  — out of scope per the roadmap.
- Routes listed above may combine live, demo, and UI-only pieces; each
  page labels its data source and the behavior available in that mode.
- **`/login`** — real authentication (Phase 10): a fresh database gets
  a one-time "create the first admin account" form; after that, a
  normal sign-in. Session cookies, hashed passwords (Node's built-in
  `scrypt`), and full sign-out are all real.
- **⌘K / Ctrl+K** anywhere — opens the command palette (navigation +
  table search).

## Design direction

"Spatial Flow" per the roadmap brief: dark, precise, developer-first.
Space Grotesk for UI text, Fira Code reserved for anything technical
(SQL, table/column names, IDs, timestamps) — that split is deliberate
structure, not decoration. One accent color (teal-cyan), used only for
primary actions, active nav state, and key metrics. Restrained glass
surfaces and a single subtle glow on primary actions; no gimmicky 3D.

All tokens live in `tailwind.config.ts` (colors, type scale, shadows,
radii) and `app/globals.css` (base resets, glass utility, scrollbar,
focus rings).

## Structure

```
app/                    routes (App Router)
  dashboard/page.tsx      Phase 2 — real dashboard
  database/page.tsx       Phase 3 — real database explorer
  components/page.tsx    Phase 1 showcase
  queries|storage|users|audit|settings/
                          placeholder routes for later phases
components/
  ui/                    reusable primitives (Button, Card, Table, Modal, Sparkline, …)
  shell/                 Sidebar, Topbar, AppShell, Logomark
  dashboard/             StatCard, ActivityFeed, TablesOverview, QuickActions
  database/              SchemaTree, TableDetail (Structure/Data tabs), TableStructure,
                         TableDataGrid, RowDetailDrawer, DatabaseExplorer, DatabasePageClient
  schema/                SchemaCanvas, SchemaNode, SchemaEdges, TableEditDrawer, RelationshipInspector
  queries/               SqlEditor, QueryResults, QueryTabs, QueryHistoryPanel, QueriesWorkspace
  storage/               BucketCard, BucketSettingsModal, FileBrowser, FileThumb,
                         FilePreviewDrawer, StorageWorkspace
  users/                 TeamList, InviteModal, PermissionMatrix, RlsPolicyViewer, UsersWorkspace
  audit/                 AuditLogTable, SystemHealthPanel, AuditWorkspace
  settings/              ProfileSection, NotificationPreferencesSection, DangerZoneSection
lib/
  db/client.ts           real PostgreSQL connection pool (pg)
  auth/session.ts        real session cookies + getCurrentUser()
  auth/password.ts       password hashing (Node's built-in scrypt)
  dashboard/stats-service.ts  real Dashboard stats query logic
  mock-data.ts           realistic static data for everything not yet wired to Postgres
  sql-mock-engine.ts     honest mock SELECT executor against mock-data's rows
  sql-highlight.ts       SQL tokenizer for syntax highlighting
  utils.ts                cn() helper
migrations/
  001_protodb_admin_schema.sql   run this once against your database
  002_sql_editor_history.sql     Phase 6 query history
  003_storage_metadata.sql       Phase 7 Storage metadata
middleware.ts            redirects unauthenticated requests to /login
```

## Known limitation

This was built and reviewed in a sandboxed environment without
package-registry access, so `npm install` / `npm run build` could not
be executed here to verify the build end to end. Every import, export,
and Tailwind token was manually cross-checked against its definition
before delivery, but please run `npm install && npm run build` on your
end as the final check, and let me know if anything surfaces.
