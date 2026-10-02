import { roleHasCapability, type AccountStatus, type AppRole } from "../auth/role-capabilities.ts";

export type DemoTeamMember = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  status: AccountStatus;
  lastActive: string | null;
};

export const DEMO_CURRENT_USER_ID = "demo-owner";
export const DEMO_MODE_COPY = {
  title: "Demo Users & Roles",
  label: "Phase 8 demo data",
  warning: "Roster, invitations, resource examples, and RLS policies are fictional and local to this browser session. Changes are not persisted or enforced.",
  identityNote: "Your signed-in session only gates access to this page. The “Demo identity” below is not your authenticated account.",
} as const;

export const DEMO_TEAM_MEMBERS: DemoTeamMember[] = [
  { id: DEMO_CURRENT_USER_ID, name: "Amelia Cross", email: "amelia@example.test", role: "Owner", status: "active", lastActive: "2026-09-02T15:02:00Z" },
  { id: "demo-admin", name: "Noah Farrell", email: "noah@example.test", role: "Admin", status: "active", lastActive: "2026-09-02T14:22:00Z" },
  { id: "demo-editor", name: "Priya Desai", email: "priya@example.test", role: "Editor", status: "active", lastActive: "2026-09-01T18:40:00Z" },
  { id: "demo-viewer", name: "Lucas Bergman", email: "lucas@example.test", role: "Viewer", status: "invited", lastActive: null },
  { id: "demo-suspended", name: "Sofia Wren", email: "sofia@example.test", role: "Editor", status: "suspended", lastActive: "2026-08-14T09:00:00Z" },
];

export const DEMO_INVITABLE_ROLES: readonly Exclude<AppRole, "Owner">[] = ["Admin", "Editor", "Viewer"];
export type DemoInvitationRole = (typeof DEMO_INVITABLE_ROLES)[number];

export type DemoInvitation = {
  source: "demo";
  id: string;
  email: string;
  role: DemoInvitationRole;
  createdAt: string;
  status: "pending";
};

export type DemoResourceType = "schema" | "table" | "bucket";
export type DemoPermissionLevel = "full" | "edit" | "view" | "none";
export const DEMO_PERMISSION_LEVELS: readonly DemoPermissionLevel[] = ["full", "edit", "view", "none"];

export type DemoResource = {
  type: DemoResourceType;
  id: string;
  name: string;
};

export type DemoResourcePermission = DemoResource & {
  source: "demo";
  id: string;
  memberId: string;
  role: AppRole;
  level: DemoPermissionLevel;
};

export const DEMO_RESOURCES: DemoResource[] = [
  { type: "schema", id: "schema:public", name: "public" },
  { type: "schema", id: "schema:analytics", name: "analytics" },
  { type: "table", id: "table:public.orders", name: "public.orders" },
  { type: "table", id: "table:public.products", name: "public.products" },
  { type: "table", id: "table:analytics.events", name: "analytics.events" },
  { type: "bucket", id: "bucket:documents", name: "documents" },
  { type: "bucket", id: "bucket:avatars", name: "avatars" },
];

function initialPermissionLevel(role: AppRole, resourceType: DemoResourceType): DemoPermissionLevel {
  if (resourceType === "schema") return roleHasCapability(role, "manageSchema") ? "full" : "view";
  if (resourceType === "table") {
    if (roleHasCapability(role, "manageSchema")) return "full";
    return roleHasCapability(role, "mutateTableData") ? "edit" : "view";
  }
  if (roleHasCapability(role, "manageStorage")) return "full";
  return roleHasCapability(role, "writeStorage") ? "edit" : "view";
}

export function createInitialDemoPermissions(members: readonly DemoTeamMember[]): DemoResourcePermission[] {
  return members.flatMap((member) => DEMO_RESOURCES.map((resource) => ({
    source: "demo" as const,
    ...resource,
    id: `${member.id}:${resource.id}`,
    memberId: member.id,
    role: member.role,
    level: initialPermissionLevel(member.role, resource.type),
  })));
}

export function createInitialDemoWorkspaceState(): {
  members: DemoTeamMember[];
  invitations: DemoInvitation[];
  permissions: DemoResourcePermission[];
  selectedMemberId: string;
} {
  const members = DEMO_TEAM_MEMBERS.map((member) => ({ ...member }));
  return {
    members,
    invitations: [],
    permissions: createInitialDemoPermissions(members),
    selectedMemberId: DEMO_CURRENT_USER_ID,
  };
}

export type DemoRlsPolicy = {
  name: string;
  command: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "ALL";
  roles: string[];
  mode: "permissive" | "restrictive";
  using: string | null;
  withCheck: string | null;
};

export type DemoRlsTable = {
  source: "demo";
  schema: string;
  table: string;
  rlsEnabled: boolean;
  forceRls: boolean;
  policies: DemoRlsPolicy[];
};

export const DEMO_RLS_TABLES: DemoRlsTable[] = [
  {
    source: "demo",
    schema: "public",
    table: "users",
    rlsEnabled: true,
    forceRls: false,
    policies: [
      { name: "users_read_own", command: "SELECT", roles: ["app_user"], mode: "permissive", using: "user_id = current_setting('app.user_id')::uuid", withCheck: null },
      { name: "users_update_own", command: "UPDATE", roles: ["app_user"], mode: "restrictive", using: "user_id = current_setting('app.user_id')::uuid", withCheck: "user_id = current_setting('app.user_id')::uuid" },
    ],
  },
  {
    source: "demo",
    schema: "public",
    table: "orders",
    rlsEnabled: true,
    forceRls: true,
    policies: [
      { name: "orders_owner_only", command: "ALL", roles: ["app_user"], mode: "permissive", using: "owner_id = current_setting('app.user_id')::uuid", withCheck: "owner_id = current_setting('app.user_id')::uuid" },
    ],
  },
  { source: "demo", schema: "public", table: "products", rlsEnabled: false, forceRls: false, policies: [] },
  { source: "demo", schema: "analytics", table: "events", rlsEnabled: true, forceRls: false, policies: [] },
];

export function getDemoViewState<T>(
  loading: boolean,
  error: string | null,
  items: readonly T[]
): { kind: "loading" } | { kind: "error"; message: string } | { kind: "empty" } | { kind: "ready"; items: readonly T[] } {
  if (loading) return { kind: "loading" };
  if (error) return { kind: "error", message: error };
  return items.length ? { kind: "ready", items } : { kind: "empty" };
}

export type DemoResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateDemoInvitation(
  emailValue: unknown,
  roleValue: unknown,
  members: readonly DemoTeamMember[],
  invitations: readonly DemoInvitation[]
): DemoResult<{ email: string; role: DemoInvitationRole }> {
  if (typeof emailValue !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue.trim())) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (typeof roleValue !== "string" || !DEMO_INVITABLE_ROLES.includes(roleValue as DemoInvitationRole)) {
    return { ok: false, error: "Choose Admin, Editor, or Viewer for this demo invitation." };
  }
  const email = emailValue.trim().toLowerCase();
  const duplicate = members.some((member) => member.email.toLowerCase() === email) ||
    invitations.some((invitation) => invitation.email.toLowerCase() === email);
  if (duplicate) return { ok: false, error: "This email is already present in the demo team or invitations." };
  return { ok: true, value: { email, role: roleValue as DemoInvitationRole } };
}

export function createDemoInvitation(
  email: unknown,
  role: unknown,
  members: readonly DemoTeamMember[],
  invitations: readonly DemoInvitation[],
  id: string,
  createdAt: string
): DemoResult<DemoInvitation> {
  const validation = validateDemoInvitation(email, role, members, invitations);
  if (!validation.ok) return validation;
  return {
    ok: true,
    value: { source: "demo", id, email: validation.value.email, role: validation.value.role, createdAt, status: "pending" },
  };
}

function findDemoMember(members: readonly DemoTeamMember[], memberId: string): DemoTeamMember | undefined {
  return members.find((member) => member.id === memberId);
}

export function changeDemoMemberRole(
  members: readonly DemoTeamMember[],
  currentUserId: string,
  memberId: string,
  role: AppRole
): DemoResult<DemoTeamMember[]> {
  const member = findDemoMember(members, memberId);
  if (!member) return { ok: false, error: "Demo team member was not found." };
  if (member.id === currentUserId) return { ok: false, error: "The demo identity cannot be changed here." };
  if (role === "Owner" && member.role !== "Owner") return { ok: false, error: "Owner cannot be assigned through the demo role selector." };
  if (member.role === "Owner" && role !== "Owner" && members.filter((candidate) => candidate.role === "Owner").length <= 1) {
    return { ok: false, error: "The final demo Owner cannot be demoted." };
  }
  return { ok: true, value: members.map((candidate) => candidate.id === memberId ? { ...candidate, role } : candidate) };
}

export function toggleDemoMemberStatus(
  members: readonly DemoTeamMember[],
  currentUserId: string,
  memberId: string
): DemoResult<DemoTeamMember[]> {
  const member = findDemoMember(members, memberId);
  if (!member) return { ok: false, error: "Demo team member was not found." };
  const status: AccountStatus = member.status === "suspended" ? "active" : "suspended";
  if (member.id === currentUserId) return { ok: false, error: "The demo identity cannot be suspended or reactivated here." };
  if (member.role === "Owner" && status === "suspended" && members.filter((candidate) => candidate.role === "Owner").length <= 1) {
    return { ok: false, error: "The final demo Owner cannot be suspended." };
  }
  return { ok: true, value: members.map((candidate) => candidate.id === memberId ? { ...candidate, status } : candidate) };
}

export function removeDemoMember(
  members: readonly DemoTeamMember[],
  currentUserId: string,
  memberId: string
): DemoResult<DemoTeamMember[]> {
  const member = findDemoMember(members, memberId);
  if (!member) return { ok: false, error: "Demo team member was not found." };
  if (member.id === currentUserId) return { ok: false, error: "The demo identity cannot be removed." };
  if (member.role === "Owner" && members.filter((candidate) => candidate.role === "Owner").length <= 1) {
    return { ok: false, error: "The final demo Owner cannot be removed." };
  }
  return { ok: true, value: members.filter((candidate) => candidate.id !== memberId) };
}

export function changeDemoPermission(
  permissions: readonly DemoResourcePermission[],
  permissionId: string,
  level: DemoPermissionLevel
): DemoResult<DemoResourcePermission[]> {
  if (!DEMO_PERMISSION_LEVELS.includes(level)) return { ok: false, error: "Unsupported demo permission level." };
  if (!permissions.some((permission) => permission.id === permissionId)) {
    return { ok: false, error: "Demo resource permission was not found." };
  }
  return {
    ok: true,
    value: permissions.map((permission) => permission.id === permissionId ? { ...permission, level } : permission),
  };
}
