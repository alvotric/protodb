# ProtoDB Admin — Build Roadmap

A private, standalone PostgreSQL administration platform. This document
is the single source of truth for scope, phase-by-phase — every phase
built so far (1–3) was inferred from a reference image and general
judgment, without an actual spec to check against. This roadmap
replaces that guesswork. From here on, "next phase" means the next
phase listed below.

**Ground rules that apply to every phase:**
- Each phase ships a working, reviewable increment — not a stub.
- Don't start the next phase's scope early, even if it would be convenient.
- Mock data is fine through Phase 9; Phase 10 is what makes it real.
- Every phase's deliverable is demoable on its own — no "trust me, it'll work once Phase X is done."

---

## Phase 1 — UI Foundation & Design System ✅
**Goal:** Establish the visual language and component library everything else is built from.

- Next.js + TypeScript + Tailwind project scaffold
- Design tokens: color, type scale (Space Grotesk / Fira Code), spacing, shadows, radii
- Reusable components: Button, Badge, Input, Switch, Tabs, Tooltip, Card, Table, Skeleton, EmptyState, ErrorState, Modal, Drawer, ConfirmDialog, CommandPalette
- App shell: Sidebar, Topbar, routing scaffold for every later phase's section
- **Non-goals:** no real pages, no real data — a `/components` showcase page and empty-shell placeholder routes only

## Phase 2 — Admin Dashboard ✅
**Goal:** The landing screen — a real snapshot of database health.

- Stat cards: database health, active connections, storage used, table count (with sparkline trends)
- Quick actions (jump to Queries, Database, Users, Audit)
- Recent activity feed
- Tables overview (top N tables, links into the Explorer)
- **Non-goals:** no live data (Phase 10), no per-metric drill-down

## Phase 3 — Database Explorer ✅
**Goal:** Browse what exists — schemas, tables, and their structure.

- Schema/table tree (grouped, collapsible, filterable)
- Table structure panel: columns, types, nullability, primary/foreign key markers
- **Non-goals:** no row data grid (Phase 4), no relationship diagram (Phase 5), no DDL editing

## Phase 4 — Table View & Data Management
**Goal:** Look at and edit actual row data, spreadsheet-style.

- Paginated, sortable data grid for a selected table
- Inline cell editing with type-aware inputs (text, number, boolean, date, null)
- Column-level filtering and a basic query-builder-style filter bar
- Add row / delete row(s) (bulk select + delete)
- Column visibility toggle, resize, reorder
- Row detail drawer (expand a row to see/edit every column at once)
- **Non-goals:** no schema changes here (renaming/adding columns is Phase 5), no raw SQL (Phase 6)

## Phase 5 — Schema Designer & Visualizer
**Goal:** See and edit how tables relate to each other.

- Visual canvas: tables as nodes, foreign keys as connecting edges
- Pan/zoom, auto-layout, manual node positioning (persisted)
- Add/edit/drop columns and constraints from the canvas (name, type, nullable, default, PK, FK target)
- Create a new table from the canvas
- Relationship inspector (click an edge to see the FK definition)
- **Non-goals:** no migration history/versioning yet (that's a Phase 10+ backend concern)

## Phase 6 — Advanced SQL Editor & Results
**Goal:** A real query workspace for anything the Explorer/Table View can't do.

- Fira Code-powered editor with SQL syntax highlighting and basic autocomplete (table/column names)
- Run query (⌘+Enter), results grid, execution time + row count
- Query history (persisted per user) and named saved queries
- Multiple tabs/panes for concurrent queries
- Error display with line/position when a query fails
- Export results (CSV/JSON)
- **Non-goals:** no query scheduling, no stored procedures editor

## Phase 7 — Storage Management
**Goal:** Manage file storage buckets alongside the database.

- Bucket list with usage stats
- File browser per bucket (folders, list/grid view, search)
- Upload (drag-and-drop, progress), download, delete, rename
- File preview (images, text, JSON) where feasible
- Bucket-level settings (public/private, size limits)
- **Non-goals:** no CDN/edge-cache configuration UI

## Phase 8 — Users, Roles & Permissions
**Goal:** Manage who can access this admin platform and what they can do.

- Team member list, invite flow, role assignment (Owner/Admin/Editor/Viewer)
- Per-resource permission matrix (which roles can touch which schemas/tables/buckets)
- Suspend/reactivate/remove a member
- Row-level security policy viewer (read-only summary of what's configured on each table)
- **Non-goals:** no custom role builder beyond the four fixed roles yet

## Phase 9 — Audit Logs & System Monitoring
**Goal:** Know what happened, and know if something's wrong.

- Searchable, filterable audit trail (actor, action, resource, result, time range)
- System health view: connection pool, slow-query log, error rate over time
- Notification preferences (which events trigger an alert, and where)
- Workspace + account Settings page (profile, notification prefs, danger zone)
- **Non-goals:** no external alerting integrations (Slack/PagerDuty) yet — that's fair game for a post-roadmap enhancement

## Phase 10 — Backend API & Real Data Integration
**Goal:** Replace every mock with the real thing.

- Actual PostgreSQL connection layer (connection pooling, credential storage/encryption)
- API routes backing every page built in Phases 2–9, one phase at a time, in the same order
- Real auth (replacing the static "Amelia Cross" mock user)
- Real-time updates where it matters (active connections, running queries) via polling or websockets
- Data migration: nothing to migrate yet since Phases 1–9 never wrote real data, but this is where that guarantee ends
- **Non-goals:** none — this phase's job is specifically to remove every other phase's non-goals around "real data"

**Progress so far (Part 1):**
- Real PostgreSQL connection (`lib/db/client.ts`, `pg`), a migration for
  this app's own `protodb_admin` schema (users/sessions/audit_log/
  saved_queries/notification_preferences), living inside your own
  database rather than needing a second connection string.
- Real auth: password hashing (Node's built-in `scrypt`, no new
  dependency), session cookies, a first-run setup flow, login/logout —
  every page's signed-in user is now this real session, not the
  static mock.
- Real Dashboard stats (Phase 2): cache hit ratio, active connections,
  database size, and table count, queried directly from Postgres's
  own system catalogs.
- **Still mock, pending in the same roadmap order:** Database Explorer
  (Phase 3), Table View writes (Phase 4), Schema Designer DDL
  execution (Phase 5), real SQL execution in the Query Editor (Phase
  6), Storage's real object storage backing (Phase 7 — needs a real
  bucket-storage layer, not just Postgres), Users/Roles reading from
  `protodb_admin.users` instead of demo state (Phase 8), and Audit
  Log reading from `protodb_admin.audit_log` (Phase 9, which auth
  routes already write real rows into). The Phase 8 interface remains
  demo-only; Phase 10 must decide how live invitations and resource
  permissions are stored/enforced and read actual RLS catalogs.

## Phase 11 — Production Readiness
**Goal:** Ready to actually run somewhere other than a laptop.

- Environment config, secrets management, deployment pipeline
- Automated tests (unit for logic-heavy pieces, integration for critical flows: auth, query execution, permissions)
- Error monitoring/logging (Sentry or equivalent)
- Performance pass (bundle size, query result pagination limits, image/asset optimization)
- Security review (SQL injection surface in the Query Editor, permission-check coverage, rate limiting)
- Deployment docs

---

## Where things stand

| Phase | Status |
|---|---|
| 1 — UI Foundation & Design System | ✅ Done |
| 2 — Admin Dashboard | ✅ Done |
| 3 — Database Explorer | ✅ Done |
| 4 — Table View & Data Management | ✅ Done |
| 5 — Schema Designer & Visualizer | ✅ Done |
| 6 — Advanced SQL Editor & Results | ✅ Done |
| 7 — Storage Management | ✅ Done |
| 8 — Users, Roles & Permissions | ✅ Done (demo-only interface; live integration remains in Phase 10) |
| 9 — Audit Logs & System Monitoring | ✅ Done |
| 10 — Backend API & Real Data Integration | 🚧 In progress (Part 1: DB + auth + Dashboard done) |
| 11 — Production Readiness | Not started |
