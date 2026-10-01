/**
 * Static mock data for Phase 1's UI shell. Nothing here is fetched —
 * Phase 1 is deliberately UI-only (see roadmap: "Do not connect the
 * first UI prototype directly to a production database"). Shaped the
 * way the real API responses will eventually look, so swapping this
 * for real data in later phases is a data-source change, not a
 * component rewrite.
 */

export type ConnectionStatus = "connected" | "degraded" | "offline";

export const dbHealth = {
  status: "connected" as ConnectionStatus,
  uptimePct: 99.97,
  activeConnections: 24,
  maxConnections: 100,
  storageUsedGb: 42.8,
  storageTotalGb: 100,
  tableCount: 37,
  avgQueryMs: 18,
};

export interface TableInfo {
  name: string;
  schema: string;
  rows: number;
  sizeMb: number;
  lastModified: string;
}

export const tables: TableInfo[] = [
  { name: "users", schema: "public", rows: 84213, sizeMb: 412.6, lastModified: "2026-09-02T14:03:00Z" },
  { name: "orders", schema: "public", rows: 213904, sizeMb: 1180.2, lastModified: "2026-09-02T13:51:00Z" },
  { name: "products", schema: "public", rows: 4821, sizeMb: 38.4, lastModified: "2026-09-01T09:14:00Z" },
  { name: "order_items", schema: "public", rows: 512004, sizeMb: 2044.8, lastModified: "2026-09-02T13:51:00Z" },
  { name: "sessions", schema: "auth", rows: 19042, sizeMb: 22.1, lastModified: "2026-09-02T15:00:00Z" },
  { name: "audit_events", schema: "system", rows: 98421, sizeMb: 156.3, lastModified: "2026-09-02T15:02:00Z" },
  { name: "webhooks", schema: "public", rows: 312, sizeMb: 1.8, lastModified: "2026-08-29T11:20:00Z" },
];

export interface QueryHistoryItem {
  id: string;
  sql: string;
  status: "success" | "error" | "running";
  rows: number | null;
  durationMs: number | null;
  ranAt: string;
  ranBy: string;
}

export const queryHistory: QueryHistoryItem[] = [
  {
    id: "qh_8f21",
    sql: "select id, email, created_at from users where last_active > now() - interval '30 days' order by created_at desc limit 50;",
    status: "success",
    rows: 50,
    durationMs: 42,
    ranAt: "2026-09-02T15:02:11Z",
    ranBy: "amelia@protodb.dev",
  },
  {
    id: "qh_8f1e",
    sql: "update orders set status = 'shipped' where id = 88213;",
    status: "success",
    rows: 1,
    durationMs: 9,
    ranAt: "2026-09-02T14:47:03Z",
    ranBy: "amelia@protodb.dev",
  },
  {
    id: "qh_8f0a",
    sql: "select * from order_items oi join products p on p.id = oi.product_id where p.category = 'archived';",
    status: "error",
    rows: null,
    durationMs: 3,
    ranAt: "2026-09-02T14:22:47Z",
    ranBy: "noah@protodb.dev",
  },
  {
    id: "qh_8ee9",
    sql: "vacuum analyze order_items;",
    status: "success",
    rows: null,
    durationMs: 18240,
    ranAt: "2026-09-02T13:10:00Z",
    ranBy: "system",
  },
];

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
  status: "active" | "invited" | "suspended";
  lastActive: string;
}

export const teamMembers: TeamMember[] = [
  { id: "u_01", name: "Amelia Cross", email: "amelia@protodb.dev", role: "Owner", status: "active", lastActive: "2026-09-02T15:02:00Z" },
  { id: "u_02", name: "Noah Farrell", email: "noah@protodb.dev", role: "Admin", status: "active", lastActive: "2026-09-02T14:22:00Z" },
  { id: "u_03", name: "Priya Desai", email: "priya@protodb.dev", role: "Editor", status: "active", lastActive: "2026-09-01T18:40:00Z" },
  { id: "u_04", name: "Lucas Bergman", email: "lucas@protodb.dev", role: "Viewer", status: "invited", lastActive: "—" },
  { id: "u_05", name: "Sofia Wren", email: "sofia@protodb.dev", role: "Editor", status: "suspended", lastActive: "2026-08-14T09:00:00Z" },
];

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  result: "success" | "failed";
  ip: string;
  at: string;
}

export const auditLog: AuditEntry[] = [
  { id: "ev_9021", actor: "amelia@protodb.dev", action: "sql.execute", resource: "orders", result: "success", ip: "82.14.203.11", at: "2026-09-02T15:02:11Z" },
  { id: "ev_9020", actor: "noah@protodb.dev", action: "schema.alter_table", resource: "products", result: "success", ip: "91.203.44.8", at: "2026-09-02T14:50:02Z" },
  { id: "ev_9019", actor: "noah@protodb.dev", action: "sql.execute", resource: "order_items", result: "failed", ip: "91.203.44.8", at: "2026-09-02T14:22:47Z" },
  { id: "ev_9018", actor: "system", action: "backup.completed", resource: "database", result: "success", ip: "—", at: "2026-09-02T03:00:00Z" },
  { id: "ev_9017", actor: "priya@protodb.dev", action: "auth.login", resource: "session", result: "success", ip: "45.10.88.2", at: "2026-09-01T18:40:00Z" },
  { id: "ev_9016", actor: "amelia@protodb.dev", action: "storage.upload", resource: "avatars", result: "success", ip: "82.14.203.11", at: "2026-09-01T16:10:00Z" },
  { id: "ev_9015", actor: "lucas@protodb.dev", action: "auth.invite_accepted", resource: "team", result: "success", ip: "203.0.113.4", at: "2026-09-01T12:05:00Z" },
  { id: "ev_9014", actor: "noah@protodb.dev", action: "users.role_changed", resource: "sofia@protodb.dev", result: "success", ip: "91.203.44.8", at: "2026-08-31T17:30:00Z" },
  { id: "ev_9013", actor: "system", action: "schedule.fired", resource: "webhooks", result: "failed", ip: "—", at: "2026-08-31T09:00:00Z" },
  { id: "ev_9012", actor: "priya@protodb.dev", action: "sql.execute", resource: "products", result: "success", ip: "45.10.88.2", at: "2026-08-30T20:12:00Z" },
  { id: "ev_9011", actor: "amelia@protodb.dev", action: "storage.bucket_settings_changed", resource: "documents", result: "success", ip: "82.14.203.11", at: "2026-08-30T11:45:00Z" },
  { id: "ev_9010", actor: "unknown", action: "auth.login", resource: "session", result: "failed", ip: "198.51.100.22", at: "2026-08-29T22:18:00Z" },
  { id: "ev_9009", actor: "amelia@protodb.dev", action: "schema.create_table", resource: "webhooks", result: "success", ip: "82.14.203.11", at: "2026-08-29T11:20:00Z" },
  { id: "ev_9008", actor: "system", action: "backup.completed", resource: "database", result: "success", ip: "—", at: "2026-08-29T03:00:00Z" },
  { id: "ev_9007", actor: "noah@protodb.dev", action: "sql.execute", resource: "users", result: "success", ip: "91.203.44.8", at: "2026-08-28T14:55:00Z" },
];

/**
 * Phase 9 — Audit Logs & System Monitoring.
 */
export const connectionPoolSeries = [12, 14, 13, 16, 19, 22, 24, 23, 20, 18, 21, 24, 22, 24];
export const errorRateSeries = [0.4, 0.3, 0.6, 0.5, 1.2, 0.8, 0.3, 0.2, 0.4, 0.9, 0.3, 0.2, 0.3, 0.3];

export interface SlowQueryLogEntry {
  id: string;
  sql: string;
  durationMs: number;
  at: string;
}

export const slowQueryLog: SlowQueryLogEntry[] = [
  { id: "sq1", sql: "select * from order_items oi join products p on p.id = oi.product_id;", durationMs: 18240, at: "2026-09-02T13:10:00Z" },
  { id: "sq2", sql: "select * from audit_events order by created_at desc;", durationMs: 4210, at: "2026-09-01T22:40:00Z" },
  { id: "sq3", sql: "update orders set status = 'shipped' where created_at < now() - interval '30 days';", durationMs: 3870, at: "2026-08-31T08:15:00Z" },
  { id: "sq4", sql: "select count(*) from sessions where expires_at < now();", durationMs: 2140, at: "2026-08-30T19:02:00Z" },
];

export interface NotificationPreference {
  id: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
}

export const notificationPreferences: NotificationPreference[] = [
  { id: "query_failed", label: "A query fails", description: "Any SQL execution that returns an error.", inApp: true, email: false },
  { id: "backup_completed", label: "Backup completes", description: "Nightly database backup finished.", inApp: true, email: true },
  { id: "member_joined", label: "New team member joins", description: "An invite is accepted.", inApp: true, email: true },
  { id: "storage_limit", label: "Storage limit reached", description: "A bucket crosses 90% of its size limit.", inApp: true, email: true },
  { id: "rls_disabled", label: "RLS disabled on a table", description: "Row-level security is turned off.", inApp: true, email: false },
  { id: "schedule_failed", label: "Scheduled trigger fails", description: "A cron or webhook-based workflow errors.", inApp: true, email: false },
];

export interface Notification {
  id: string;
  title: string;
  description: string;
  read: boolean;
  at: string;
}

export const notifications: Notification[] = [
  { id: "n1", title: "Backup completed", description: "Nightly backup finished in 4m 12s.", read: false, at: "2026-09-02T03:00:00Z" },
  { id: "n2", title: "Slow query detected", description: "A query on order_items took 18.2s to complete.", read: false, at: "2026-09-02T13:10:00Z" },
  { id: "n3", title: "New team member", description: "Lucas Bergman was invited as Viewer.", read: true, at: "2026-09-01T10:00:00Z" },
];

export const currentUser = {
  name: "Amelia Cross",
  email: "amelia@protodb.dev",
  role: "Owner" as const,
  initials: "AC",
};

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Phase 2 — Admin Dashboard.
 * Sparkline series for the stat cards -- 14 points, roughly hourly,
 * shaped like plausible real trend data (not a straight line or pure
 * random noise) so the cards read as genuine at a glance.
 */
export const connectionsSeries = [14, 16, 15, 18, 21, 19, 22, 24, 23, 20, 22, 25, 24, 24];
export const queryLatencySeries = [22, 20, 19, 24, 30, 26, 18, 17, 19, 21, 18, 16, 18, 18];
export const storageSeries = [38.1, 38.4, 38.9, 39.5, 40.1, 40.6, 41.0, 41.4, 41.9, 42.1, 42.3, 42.5, 42.7, 42.8];

export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  kind: "schema" | "query" | "user" | "system";
  at: string;
}

export const activityFeed: ActivityItem[] = [
  { id: "a1", actor: "amelia@protodb.dev", action: "ran a query on", target: "orders", kind: "query", at: "2026-09-02T15:02:11Z" },
  { id: "a2", actor: "noah@protodb.dev", action: "altered table", target: "products", kind: "schema", at: "2026-09-02T14:50:02Z" },
  { id: "a3", actor: "system", action: "completed nightly backup of", target: "database", kind: "system", at: "2026-09-02T03:00:00Z" },
  { id: "a4", actor: "priya@protodb.dev", action: "signed in from", target: "45.10.88.2", kind: "user", at: "2026-09-01T18:40:00Z" },
  { id: "a5", actor: "amelia@protodb.dev", action: "created table", target: "webhooks", kind: "schema", at: "2026-08-29T11:20:00Z" },
  { id: "a6", actor: "system", action: "ran vacuum analyze on", target: "order_items", kind: "system", at: "2026-09-02T13:10:00Z" },
];

/**
 * Phase 3 — Database Explorer.
 * Column-level structure for a subset of `tables` — enough to make
 * the explorer's structure panel feel real. Deliberately not every
 * table (webhooks, sessions, audit_events aren't detailed here);
 * Phase 3 is about browsing structure, not being a complete schema
 * fixture -- more tables can gain columns here as later phases need
 * them without changing the shape.
 */
export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  default?: string;
}

export const tableColumns: Record<string, TableColumn[]> = {
  users: [
    { name: "id", type: "uuid", nullable: false, isPrimaryKey: true, default: "gen_random_uuid()" },
    { name: "email", type: "text", nullable: false },
    { name: "full_name", type: "text", nullable: true },
    { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
    { name: "last_active", type: "timestamptz", nullable: true },
  ],
  orders: [
    { name: "id", type: "bigint", nullable: false, isPrimaryKey: true, default: "identity" },
    { name: "user_id", type: "uuid", nullable: false, isForeignKey: true },
    { name: "status", type: "text", nullable: false, default: "'pending'" },
    { name: "total_cents", type: "integer", nullable: false },
    { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
  ],
  products: [
    { name: "id", type: "bigint", nullable: false, isPrimaryKey: true, default: "identity" },
    { name: "name", type: "text", nullable: false },
    { name: "category", type: "text", nullable: true },
    { name: "price_cents", type: "integer", nullable: false },
    { name: "in_stock", type: "boolean", nullable: false, default: "true" },
  ],
  order_items: [
    { name: "id", type: "bigint", nullable: false, isPrimaryKey: true, default: "identity" },
    { name: "order_id", type: "bigint", nullable: false, isForeignKey: true },
    { name: "product_id", type: "bigint", nullable: false, isForeignKey: true },
    { name: "quantity", type: "integer", nullable: false, default: "1" },
    { name: "unit_price_cents", type: "integer", nullable: false },
  ],
};

/**
 * Phase 4 — Table View & Data Management.
 * Actual row-level data for the grid, keyed by table name -- written
 * as static literals (not generated with Math.random() or a
 * timestamp) so server and client render identically and hydration
 * never mismatches. Only `users` and `products` get full row sets;
 * `orders`/`order_items` stay structure-only for now, same as their
 * treatment in Phase 3 -- the Data tab says so honestly rather than
 * faking a shorter table than the real one.
 */
export type CellValue = string | number | boolean | null;
export type TableRowData = Record<string, CellValue>;

export const tableRows: Record<string, TableRowData[]> = {
  users: [
    { id: "8f2a1c40-11a2", email: "ava.brennan@lumen.co", full_name: "Ava Brennan", created_at: "2026-01-14T09:20:00Z", last_active: "2026-09-02T15:02:00Z" },
    { id: "3d7e9b21-88f0", email: "liam.oduya@brightpath.io", full_name: "Liam Oduya", created_at: "2026-01-22T13:05:00Z", last_active: "2026-09-01T10:40:00Z" },
    { id: "c19a4f77-2201", email: "maya.reinholt@nordframe.dev", full_name: "Maya Reinholt", created_at: "2026-02-03T08:12:00Z", last_active: "2026-08-30T19:15:00Z" },
    { id: "0e56b8d3-9a12", email: "ethan.moss@fieldstack.com", full_name: "Ethan Moss", created_at: "2026-02-11T16:44:00Z", last_active: null },
    { id: "a48c2d90-e731", email: "zara.whitlock@driftwood.app", full_name: "Zara Whitlock", created_at: "2026-02-19T11:30:00Z", last_active: "2026-09-02T08:05:00Z" },
    { id: "77f1e3a2-1c88", email: "noah.esperanza@vantable.io", full_name: "Noah Esperanza", created_at: "2026-03-01T07:55:00Z", last_active: "2026-08-28T14:20:00Z" },
    { id: "b90d5f61-4477", email: "elena.marceau@lumen.co", full_name: "Elena Marceau", created_at: "2026-03-09T14:18:00Z", last_active: "2026-09-01T21:10:00Z" },
    { id: "1a2f8c33-77bd", email: "kai.nishimura@brightpath.io", full_name: "Kai Nishimura", created_at: "2026-03-17T10:02:00Z", last_active: null },
    { id: "e6b4a109-2f90", email: "priya.chandran@nordframe.dev", full_name: "Priya Chandran", created_at: "2026-03-25T18:40:00Z", last_active: "2026-09-02T12:30:00Z" },
    { id: "4c8d9e12-aa03", email: "owen.faulkner@fieldstack.com", full_name: "Owen Faulkner", created_at: "2026-04-02T09:16:00Z", last_active: "2026-08-31T09:00:00Z" },
    { id: "9f0a3b55-6612", email: "nadia.solheim@driftwood.app", full_name: "Nadia Solheim", created_at: "2026-04-10T15:28:00Z", last_active: "2026-09-02T17:45:00Z" },
    { id: "d2e7c891-3300", email: "leo.tran@vantable.io", full_name: "Leo Tran", created_at: "2026-04-18T12:52:00Z", last_active: null },
    { id: "6b1f4a02-9988", email: "sofia.henriksen@lumen.co", full_name: "Sofia Henriksen", created_at: "2026-04-26T08:38:00Z", last_active: "2026-08-29T16:55:00Z" },
    { id: "f83c0d17-2255", email: "mateo.villanueva@brightpath.io", full_name: "Mateo Villanueva", created_at: "2026-05-04T17:11:00Z", last_active: "2026-09-01T13:25:00Z" },
    { id: "2a9e6f44-8871", email: "ivy.okonkwo@nordframe.dev", full_name: "Ivy Okonkwo", created_at: "2026-05-12T13:47:00Z", last_active: "2026-09-02T11:00:00Z" },
    { id: "5c0b8d29-1109", email: "ruben.alvarado@fieldstack.com", full_name: "Ruben Alvarado", created_at: "2026-05-20T10:23:00Z", last_active: null },
    { id: "88d4e731-5566", email: "amara.oyelaran@driftwood.app", full_name: "Amara Oyelaran", created_at: "2026-05-28T16:59:00Z", last_active: "2026-08-27T20:10:00Z" },
    { id: "c07a2f10-9934", email: "felix.brandt@vantable.io", full_name: "Felix Brandt", created_at: "2026-06-05T09:34:00Z", last_active: "2026-09-02T09:50:00Z" },
    { id: "1e5b9c48-4423", email: "talia.rosenqvist@lumen.co", full_name: "Talia Rosenqvist", created_at: "2026-06-13T14:06:00Z", last_active: "2026-08-30T10:15:00Z" },
    { id: "a30d7e62-8801", email: "dev.kapoor@brightpath.io", full_name: "Dev Kapoor", created_at: "2026-06-21T11:41:00Z", last_active: null },
    { id: "7f4c1a95-2267", email: "wren.castellano@nordframe.dev", full_name: "Wren Castellano", created_at: "2026-06-29T18:17:00Z", last_active: "2026-09-02T14:35:00Z" },
    { id: "3b8e0d54-5590", email: "arlo.fenwick@fieldstack.com", full_name: "Arlo Fenwick", created_at: "2026-07-07T15:53:00Z", last_active: "2026-08-31T18:05:00Z" },
    { id: "e91a4c73-3312", email: "nina.pallavicini@driftwood.app", full_name: "Nina Pallavicini", created_at: "2026-07-15T12:29:00Z", last_active: "2026-09-01T16:20:00Z" },
    { id: "62f9b208-7745", email: "silas.moreau@vantable.io", full_name: "Silas Moreau", created_at: "2026-07-23T09:05:00Z", last_active: null },
  ],
  products: [
    { id: 101, name: "Aurora Desk Lamp", category: "Lighting", price_cents: 4900, in_stock: true },
    { id: 102, name: "Basalt Ceramic Mug", category: "Kitchen", price_cents: 1800, in_stock: true },
    { id: 103, name: "Fieldnote Journal", category: "Stationery", price_cents: 2200, in_stock: true },
    { id: 104, name: "Halcyon Wool Throw", category: "Home", price_cents: 8900, in_stock: false },
    { id: 105, name: "Meridian Backpack", category: "Bags", price_cents: 12900, in_stock: true },
    { id: 106, name: "Pinecrest Candle", category: "Home", price_cents: 2600, in_stock: true },
    { id: 107, name: "Quietwave Earbuds", category: "Electronics", price_cents: 7400, in_stock: true },
    { id: 108, name: "Rowan Cutting Board", category: "Kitchen", price_cents: 3400, in_stock: false },
    { id: 109, name: "Solace Reading Chair", category: "Furniture", price_cents: 34900, in_stock: true },
    { id: 110, name: "Tidepool Water Bottle", category: "Outdoor", price_cents: 2900, in_stock: true },
    { id: 111, name: "Umbra Table Clock", category: "Home", price_cents: 3900, in_stock: true },
    { id: 112, name: "Verdant Plant Stand", category: "Furniture", price_cents: 5600, in_stock: false },
    { id: 113, name: "Wanderlust Duffel", category: "Bags", price_cents: 9800, in_stock: true },
    { id: 114, name: "Xylo Bluetooth Speaker", category: "Electronics", price_cents: 6200, in_stock: true },
    { id: 115, name: "Yarrow Linen Napkins", category: "Kitchen", price_cents: 1500, in_stock: true },
    { id: 116, name: "Zephyr Rain Jacket", category: "Outdoor", price_cents: 11900, in_stock: true },
    { id: 117, name: "Amber Glass Vase", category: "Home", price_cents: 3300, in_stock: false },
    { id: 118, name: "Birchwood Coasters", category: "Kitchen", price_cents: 1600, in_stock: true },
    { id: 119, name: "Cobalt Notebook Sleeve", category: "Stationery", price_cents: 2400, in_stock: true },
    { id: 120, name: "Driftwood Wall Shelf", category: "Furniture", price_cents: 6800, in_stock: true },
  ],
};

/**
 * Phase 5 — Schema Designer & Visualizer.
 * Column definitions for the three tables that didn't need them
 * before Phase 3 (structure only, no row grid) -- the diagram wants
 * every table's columns, not just the four with full row data.
 */
tableColumns.sessions = [
  { name: "id", type: "uuid", nullable: false, isPrimaryKey: true, default: "gen_random_uuid()" },
  { name: "user_id", type: "uuid", nullable: false, isForeignKey: true },
  { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
  { name: "expires_at", type: "timestamptz", nullable: false },
];
tableColumns.audit_events = [
  { name: "id", type: "bigint", nullable: false, isPrimaryKey: true, default: "identity" },
  { name: "actor", type: "text", nullable: false },
  { name: "action", type: "text", nullable: false },
  { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
];
tableColumns.webhooks = [
  { name: "id", type: "bigint", nullable: false, isPrimaryKey: true, default: "identity" },
  { name: "url", type: "text", nullable: false },
  { name: "event_type", type: "text", nullable: false },
  { name: "active", type: "boolean", nullable: false, default: "true" },
];

/** Every foreign-key relationship in the schema, independent of any one table's column list -- what the diagram's edges are drawn from. */
export interface ForeignKeyRef {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
}

export const foreignKeys: ForeignKeyRef[] = [
  { table: "orders", column: "user_id", refTable: "users", refColumn: "id" },
  { table: "sessions", column: "user_id", refTable: "users", refColumn: "id" },
  { table: "order_items", column: "order_id", refTable: "orders", refColumn: "id" },
  { table: "order_items", column: "product_id", refTable: "products", refColumn: "id" },
];

/**
 * Starting canvas positions for the schema diagram -- hand-placed
 * (not auto-computed) so foreign-key edges cross as little as
 * possible on first load. Dragging a node updates this shape at
 * runtime in component state; this is only the initial layout.
 */
export const schemaNodePositions: Record<string, { x: number; y: number }> = {
  users: { x: 40, y: 60 },
  orders: { x: 380, y: 60 },
  products: { x: 720, y: 60 },
  webhooks: { x: 1060, y: 60 },
  sessions: { x: 40, y: 360 },
  order_items: { x: 380, y: 360 },
  audit_events: { x: 720, y: 360 },
};

/**
 * Phase 7 — Storage Management.
 * Seed buckets/files. Text/JSON seed files carry real `content`
 * (genuinely previewable and downloadable, same honesty as the
 * runnable-SELECT-only SQL engine) -- image/pdf seed files don't
 * exist as real bytes anywhere, so they render a generic type icon
 * rather than a fabricated photo, and say so plainly if you try to
 * download one. Anything a user actually drags/drops into the
 * browser in this session is real (read via the File API) and is
 * handled entirely separately, in component state.
 */
export interface StorageBucket {
  id: string;
  name: string;
  public: boolean;
  sizeLimitMb: number | null;
}

export const storageBuckets: StorageBucket[] = [
  { id: "avatars", name: "avatars", public: true, sizeLimitMb: 50 },
  { id: "documents", name: "documents", public: false, sizeLimitMb: 500 },
  { id: "backups", name: "backups", public: false, sizeLimitMb: null },
];

export interface StorageFileSeed {
  id: string;
  bucketId: string;
  name: string;
  folder: string;
  kind: "image" | "text" | "json" | "pdf";
  sizeBytes: number;
  modifiedAt: string;
  content?: string;
}

export const storageFiles: StorageFileSeed[] = [
  { id: "f1", bucketId: "avatars", name: "amelia-cross.png", folder: "", kind: "image", sizeBytes: 84213, modifiedAt: "2026-08-20T10:00:00Z" },
  { id: "f2", bucketId: "avatars", name: "noah-farrell.png", folder: "", kind: "image", sizeBytes: 76890, modifiedAt: "2026-08-14T09:30:00Z" },
  { id: "f3", bucketId: "avatars", name: "priya-desai.png", folder: "", kind: "image", sizeBytes: 91120, modifiedAt: "2026-07-30T14:15:00Z" },
  {
    id: "f4",
    bucketId: "documents",
    name: "README.md",
    folder: "",
    kind: "text",
    sizeBytes: 412,
    modifiedAt: "2026-09-01T08:00:00Z",
    content:
      "# Documents bucket\n\nInternal documents for ProtoDB. Contracts live in /contracts,\nreceipts in /receipts. Everything else stays at the root.\n\nAccess is private -- only signed-in team members can read these files.",
  },
  {
    id: "f5",
    bucketId: "documents",
    name: "master-agreement.pdf",
    folder: "contracts",
    kind: "pdf",
    sizeBytes: 244890,
    modifiedAt: "2026-06-11T12:00:00Z",
  },
  {
    id: "f6",
    bucketId: "documents",
    name: "vendor-nda.pdf",
    folder: "contracts",
    kind: "pdf",
    sizeBytes: 118330,
    modifiedAt: "2026-07-02T09:45:00Z",
  },
  {
    id: "f7",
    bucketId: "documents",
    name: "q2-hosting.json",
    folder: "receipts",
    kind: "json",
    sizeBytes: 268,
    modifiedAt: "2026-07-15T16:20:00Z",
    content: JSON.stringify({ vendor: "Cloudframe Hosting", amount_cents: 48900, period: "2026-Q2", paid: true }, null, 2),
  },
  {
    id: "f8",
    bucketId: "backups",
    name: "schema-snapshot-2026-09-02.json",
    folder: "",
    kind: "json",
    sizeBytes: 1840,
    modifiedAt: "2026-09-02T03:00:00Z",
    content: JSON.stringify({ tables: tables.map((t) => t.name), takenAt: "2026-09-02T03:00:00Z", schemaVersion: 14 }, null, 2),
  },
  {
    id: "f9",
    bucketId: "backups",
    name: "notes.txt",
    folder: "",
    kind: "text",
    sizeBytes: 156,
    modifiedAt: "2026-08-25T11:00:00Z",
    content: "Nightly backups run at 03:00 UTC. Retained for 30 days.\nRestore procedure: see runbook in documents/contracts.",
  },
];

/**
 * Phase 8 — Users, Roles & Permissions.
 */
export type PermissionLevel = "full" | "edit" | "view" | "none";

export interface ResourcePermission {
  resource: string;
  owner: PermissionLevel;
  admin: PermissionLevel;
  editor: PermissionLevel;
  viewer: PermissionLevel;
}

export const defaultPermissions: ResourcePermission[] = [
  { resource: "Database & Schema", owner: "full", admin: "full", editor: "edit", viewer: "view" },
  { resource: "Table Data", owner: "full", admin: "full", editor: "edit", viewer: "view" },
  { resource: "SQL Queries", owner: "full", admin: "full", editor: "edit", viewer: "view" },
  { resource: "Storage", owner: "full", admin: "full", editor: "edit", viewer: "view" },
  { resource: "Users & Roles", owner: "full", admin: "edit", editor: "view", viewer: "none" },
  { resource: "Audit Log", owner: "full", admin: "view", editor: "view", viewer: "none" },
  { resource: "Settings", owner: "full", admin: "edit", editor: "none", viewer: "none" },
];

export interface RlsPolicy {
  name: string;
  command: "select" | "insert" | "update" | "delete" | "all";
  using: string;
}

export interface RlsTableStatus {
  table: string;
  enabled: boolean;
  policies: RlsPolicy[];
}

export const rlsStatus: RlsTableStatus[] = [
  {
    table: "users",
    enabled: true,
    policies: [
      { name: "users_read_own", command: "select", using: "auth.uid() = id" },
      { name: "users_update_own", command: "update", using: "auth.uid() = id" },
    ],
  },
  {
    table: "orders",
    enabled: true,
    policies: [{ name: "orders_owner_only", command: "all", using: "auth.uid() = user_id" }],
  },
  {
    table: "order_items",
    enabled: true,
    policies: [
      { name: "order_items_via_order", command: "select", using: "order_id in (select id from orders where user_id = auth.uid())" },
    ],
  },
  { table: "products", enabled: false, policies: [] },
  {
    table: "sessions",
    enabled: true,
    policies: [{ name: "sessions_owner_only", command: "all", using: "auth.uid() = user_id" }],
  },
  { table: "audit_events", enabled: true, policies: [{ name: "audit_admin_read", command: "select", using: "auth.role() in ('owner','admin')" }] },
  { table: "webhooks", enabled: false, policies: [] },
];
