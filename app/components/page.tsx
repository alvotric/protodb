"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  Download,
  Trash2,
  Info,
  Table2,
  RefreshCw,
  Ban,
  Inbox,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import type { SessionUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { tables, dbHealth } from "@/lib/mock-data";

// This is a design-system reference page, not a real data page --
// unlike every other route (which shows the real signed-in user from
// lib/auth/session.ts), a literal placeholder is honest and correct
// here since there's nothing real to show.
const DEMO_USER: SessionUser = { id: "demo", email: "preview@protodb.dev", name: "Preview User", role: "Viewer", status: "active" };

type SectionId = "foundations" | "actions" | "forms" | "data" | "feedback" | "overlays";

const sections: TabItem[] = [
  { value: "foundations", label: "Foundations" },
  { value: "actions", label: "Buttons & Badges" },
  { value: "forms", label: "Forms" },
  { value: "data", label: "Cards & Tables" },
  { value: "feedback", label: "States" },
  { value: "overlays", label: "Overlays" },
];

export default function ComponentsPage() {
  const [section, setSection] = useState<SectionId>("foundations");
  const [tableState, setTableState] = useState<"loaded" | "loading" | "empty" | "error">("loaded");
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <AppShell title="Design System" user={DEMO_USER}>
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">Design System</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
          Phase 1 deliverable — every reusable component the roadmap calls for, shown with realistic
          mock data and its loading, empty, and error states. Later phases assemble real pages from
          these same pieces.
        </p>
      </div>

      <Tabs items={sections} value={section} onChange={(v) => setSection(v as SectionId)} />

      <div className="mt-6 space-y-10">
        {section === "foundations" && (
          <>
            <section>
              <h2 className="mb-3 text-sm font-medium text-ink-muted">Typography</h2>
              <Card className="p-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-4xl font-semibold tracking-tight text-ink">Heading 1</p>
                    <p className="text-2xl font-medium text-ink">Heading 2</p>
                    <p className="text-lg font-medium text-ink">Heading 3</p>
                    <p className="text-base text-ink-muted">
                      Body text sits at 14px — dense enough for a developer console without feeling
                      cramped. Space Grotesk carries every label, heading, and sentence in the UI.
                    </p>
                  </div>
                  <div className="space-y-3 rounded-lg border border-border bg-surface p-4 font-mono text-sm">
                    <p className="text-ink-faint"># Fira Code — technical values only</p>
                    <p className="text-accent">select id, email from users</p>
                    <p className="text-ink">where created_at &gt; now() - interval &apos;7d&apos;;</p>
                    <p className="text-ink-muted">-- 00e29f1a-8b3c · 42ms · 12 rows</p>
                  </div>
                </div>
              </Card>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-ink-muted">Color</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { name: "Canvas", cls: "bg-canvas" },
                  { name: "Surface", cls: "bg-surface" },
                  { name: "Accent", cls: "bg-accent" },
                  { name: "Success", cls: "bg-success" },
                  { name: "Warning", cls: "bg-warning" },
                  { name: "Danger", cls: "bg-danger" },
                ].map((c) => (
                  <div key={c.name} className="overflow-hidden rounded-lg border border-border">
                    <div className={`h-14 ${c.cls}`} />
                    <p className="bg-surface px-2.5 py-2 text-xs text-ink-muted">{c.name}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {section === "actions" && (
          <>
            <section>
              <h2 className="mb-3 text-sm font-medium text-ink-muted">Buttons</h2>
              <Card className="flex flex-wrap items-center gap-3 p-6">
                <Button variant="primary">
                  <Plus className="h-3.5 w-3.5" />
                  New query
                </Button>
                <Button variant="secondary">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="danger">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button variant="primary" loading>
                  Running
                </Button>
                <Button variant="secondary" disabled>
                  Disabled
                </Button>
                <Button variant="secondary" size="icon" aria-label="Refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </Card>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-ink-muted">Badges</h2>
              <Card className="flex flex-wrap items-center gap-3 p-6">
                <Badge tone="neutral">draft</Badge>
                <Badge tone="success" dot>
                  active
                </Badge>
                <Badge tone="warning" dot>
                  degraded
                </Badge>
                <Badge tone="danger" dot>
                  failed
                </Badge>
                <Badge tone="accent">Owner</Badge>
              </Card>
            </section>
          </>
        )}

        {section === "forms" && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-ink-muted">Inputs &amp; controls</h2>
            <Card className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">Search tables</label>
                <Input icon={<Search className="h-4 w-4" />} placeholder="users, orders, products…" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">Connection string</label>
                <Input mono placeholder="postgres://user:pass@host:5432/db" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">Table name</label>
                <Input defaultValue="orders_2026" error="A table with this name already exists." />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-3">
                <div>
                  <p className="text-sm text-ink">Email notifications</p>
                  <p className="text-xs text-ink-faint">Get notified about failed queries.</p>
                </div>
                <Switch checked={notifyEnabled} onChange={setNotifyEnabled} aria-label="Email notifications" />
              </div>
            </Card>
          </section>
        )}

        {section === "data" && (
          <>
            <section>
              <h2 className="mb-3 text-sm font-medium text-ink-muted">Cards</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="p-5">
                  <p className="text-xs text-ink-muted">Database health</p>
                  <p className="mt-2 text-2xl font-medium text-success">{dbHealth.uptimePct}%</p>
                  <p className="mt-1 text-xs text-ink-faint">Excellent</p>
                </Card>
                <Card className="p-5">
                  <p className="text-xs text-ink-muted">Active connections</p>
                  <p className="mt-2 text-2xl font-medium text-ink">
                    {dbHealth.activeConnections}
                    <span className="text-sm text-ink-faint"> / {dbHealth.maxConnections}</span>
                  </p>
                </Card>
                <Card className="p-5">
                  <p className="text-xs text-ink-muted">Storage</p>
                  <p className="mt-2 text-2xl font-medium text-ink">{dbHealth.storageUsedGb} GB</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(dbHealth.storageUsedGb / dbHealth.storageTotalGb) * 100}%` }}
                    />
                  </div>
                </Card>
              </div>

              <Card className="mt-4">
                <CardHeader>
                  <div>
                    <CardTitle>Recent tables</CardTitle>
                    <CardDescription>Mock data — Phase 3 replaces this with a live query.</CardDescription>
                  </div>
                  <Tooltip content="Schema and row counts refresh every 5 minutes">
                    <Info className="h-4 w-4 text-ink-faint" />
                  </Tooltip>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {tables.slice(0, 3).map((t) => (
                      <li key={t.name} className="flex items-center justify-between py-2.5">
                        <span className="font-mono text-sm text-ink">{t.name}</span>
                        <span className="text-xs text-ink-faint">{t.rows.toLocaleString()} rows</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-ink-muted">Table</h2>
                <div className="flex gap-1.5">
                  {(["loaded", "loading", "empty", "error"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setTableState(s)}
                      className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
                        tableState === s
                          ? "bg-accent-soft text-accent"
                          : "text-ink-faint hover:text-ink-muted"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {tableState === "empty" ? (
                <Card>
                  <EmptyState
                    icon={Inbox}
                    title="No tables yet"
                    description="Tables you create will show up here. Connect a schema to get started."
                    action={
                      <Button size="sm">
                        <Plus className="h-3.5 w-3.5" />
                        New table
                      </Button>
                    }
                  />
                </Card>
              ) : tableState === "error" ? (
                <Card>
                  <ErrorState
                    title="Couldn't load tables"
                    description="The connection to the database timed out. Check that it's reachable and try again."
                    action={
                      <Button size="sm" variant="secondary">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Name</TableHeaderCell>
                      <TableHeaderCell>Schema</TableHeaderCell>
                      <TableHeaderCell>Rows</TableHeaderCell>
                      <TableHeaderCell>Size</TableHeaderCell>
                      <TableHeaderCell>Last modified</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {tableState === "loading"
                      ? Array.from({ length: 4 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={5}>
                              <Skeleton className="h-4 w-full max-w-xs" />
                            </TableCell>
                          </TableRow>
                        ))
                      : tables.map((t) => (
                          <TableRow key={t.name}>
                            <TableCell className="flex items-center gap-2 font-mono">
                              <Table2 className="h-3.5 w-3.5 text-ink-faint" />
                              {t.name}
                            </TableCell>
                            <TableCell mono>{t.schema}</TableCell>
                            <TableCell mono>{t.rows.toLocaleString()}</TableCell>
                            <TableCell mono>{t.sizeMb.toLocaleString()} MB</TableCell>
                            <TableCell className="text-ink-muted">
                              {new Date(t.lastModified).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </>
        )}

        {section === "feedback" && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-ink-muted">Empty &amp; error states</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <EmptyState
                  icon={Ban}
                  title="No audit events"
                  description="Sensitive operations will appear here as they happen."
                />
              </Card>
              <Card>
                <ErrorState description="The query took too long and was canceled after 30s." />
              </Card>
            </div>
          </section>
        )}

        {section === "overlays" && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-ink-muted">Modal, drawer, confirm &amp; command palette</h2>
            <Card className="flex flex-wrap items-center gap-3 p-6">
              <Button variant="secondary" onClick={() => setModalOpen(true)}>
                Open modal
              </Button>
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                Open drawer
              </Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete table…
              </Button>
              <span className="text-xs text-ink-faint">
                Command palette is global — press <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">⌘K</kbd> anywhere.
              </span>
            </Card>
          </section>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create table"
        description="Define the table name and its initial columns."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => setModalOpen(false)}>
              Create table
            </Button>
          </>
        }
      >
        <Input placeholder="Table name" mono />
      </Modal>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="orders" description="public schema · 213,904 rows">
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-ink-faint">Columns</p>
            <p className="mt-1 font-mono text-sm text-ink">id, user_id, status, total_cents, created_at</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-ink-faint">Size on disk</p>
            <p className="mt-1 text-sm text-ink">1,180.2 MB</p>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this table?"
        description="This permanently deletes 'orders' and all 213,904 rows in it. This can't be undone."
        confirmLabel="Delete table"
        destructive
        loading={deleting}
        onConfirm={() => {
          setDeleting(true);
          setTimeout(() => {
            setDeleting(false);
            setConfirmOpen(false);
          }, 900);
        }}
      />
    </AppShell>
  );
}
