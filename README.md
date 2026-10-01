# ProtoDB Admin — Phase 10 (Part 1): Backend API & Real Data Integration

Standalone frontend for a private PostgreSQL admin platform. See
**[ROADMAP.md](./ROADMAP.md)** for the full 11-phase plan — the
authoritative scope reference from here on.

**This is the first response with a real backend.** Phases 1–9 (every
page's UI) are done; Phase 10 replaces their mock data with real
Postgres queries, one phase at a time, per the roadmap's own framing.
This pass covers: a real database connection, real authentication
(login/session/first-run setup), and real Dashboard stats. Every other
page still shows its Phase 1–9 mock data — the roadmap file tracks
exactly what's real vs. still mock, phase by phase.

## Setup (new in Phase 10)

```bash
cp .env.example .env.local   # then fill in DATABASE_URL
psql "$DATABASE_URL" -f migrations/001_protodb_admin_schema.sql
npm install
npm run dev
```

Visit the app — since a fresh database has no users yet, you'll be
walked through creating the first admin account (it becomes Owner).
Without `DATABASE_URL` set, the app still runs: every Phase 1–9 route
works with mock data, and the Dashboard/login pages show an honest
"not connected" state instead of crashing.

Then open http://localhost:3000 — it redirects to `/dashboard` (or
`/login` first, if you're not signed in).

## What's here

- **`/database`** — Phases 3–5's real deliverable, two whole-page
  views (switch via the tabs at the top):
  - **Explorer** (Phase 3–4): schema/table tree, per-table Structure
    (columns/types/keys) and Data (paginated, sortable, filterable
    grid with inline editing, bulk delete, row-detail drawer) tabs.
  - **Schema Diagram** (Phase 5): every table as a draggable node on
    a pan/zoom canvas, foreign keys drawn as clickable connector
    lines (click one for the relationship inspector), add/edit/drop
    columns per table, and a "New table" flow — all from the canvas.
  Full row/column data exists for `users` and `products`; every table
  has column/structure data for the diagram. Still mock data — this
  page's real-data pass is next in Phase 10's continuation.
- **`/dashboard`** — Phase 2's real deliverable, now backed by real
  data (Phase 10): cache hit ratio, active connections, and database
  size come directly from Postgres's own system catalogs. Quick
  actions, recent activity, and the tables overview below are still
  Phase 1–9 mock data pending their own turn.
- **`/components`** — Phase 1's deliverable. Every reusable component
  (buttons, badges, inputs, switch, tabs, cards, table, tooltip,
  modal, drawer, confirm dialog, command palette) shown with mock
  data, including loading/empty/error states you can toggle live.
- **`/queries`** — Phase 6's real deliverable: a SQL workspace.
  Fira Code editor with real syntax highlighting and basic
  table/column autocomplete (both hand-rolled, no editor library),
  multiple concurrent query tabs, session query history and named
  saved queries, and a results grid with real CSV/JSON export. Query
  *execution* is an honest simulation: it recognizes simple
  `SELECT ... FROM <table>` (with WHERE col = value / LIMIT) against
  the real mock row data from Phase 4, and gives a clear, specific
  error for anything else rather than faking a result — genuine SQL
  execution is Phase 10.
- **`/storage`** — Phase 7's real deliverable: bucket list with real
  computed usage stats, a per-bucket file browser (folders, search,
  list/grid views). Upload is genuinely real -- drag-and-drop or the
  Upload button reads actual files via the browser File API, no fake
  progress bar. Text/JSON uploads get real content read in and
  previewed; images get a real thumbnail via a live object URL.
  Rename, bulk delete, and bucket settings (public/private, size
  limit) all work. Seed mock image/PDF files have no real bytes
  anywhere, so they get a generic icon and an honest "nothing to
  download" note rather than a fabricated file.
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
- Every route above is real and interactive; the Dashboard's stat
  cards are now genuinely real (Phase 10), everything else still runs
  on Phase 1–9 mock data until its own turn in Phase 10's continuation.
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
middleware.ts            redirects unauthenticated requests to /login
```

## Known limitation

This was built and reviewed in a sandboxed environment without
package-registry access, so `npm install` / `npm run build` could not
be executed here to verify the build end to end. Every import, export,
and Tailwind token was manually cross-checked against its definition
before delivery, but please run `npm install && npm run build` on your
end as the final check, and let me know if anything surfaces.
