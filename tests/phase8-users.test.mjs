import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_ROLES,
  ROLE_CAPABILITIES,
  ROLE_CAPABILITY_DESCRIPTIONS,
  roleHasCapability,
} from "../lib/auth/role-capabilities.ts";
import {
  changeDemoMemberRole,
  changeDemoPermission,
  createDemoInvitation,
  createInitialDemoWorkspaceState,
  createInitialDemoPermissions,
  DEMO_CURRENT_USER_ID,
  DEMO_INVITABLE_ROLES,
  DEMO_MODE_COPY,
  DEMO_PERMISSION_LEVELS,
  DEMO_RESOURCES,
  DEMO_RLS_TABLES,
  DEMO_TEAM_MEMBERS,
  getDemoViewState,
  removeDemoMember,
  toggleDemoMemberStatus,
  validateDemoInvitation,
} from "../lib/users/phase8-demo.ts";

function members() {
  return DEMO_TEAM_MEMBERS.map((member) => ({ ...member }));
}

test("fixed role capability map matches current server authorization rules", () => {
  assert.deepEqual(APP_ROLES, ["Owner", "Admin", "Editor", "Viewer"]);
  assert.equal(roleHasCapability("Owner", "executeSql"), true);
  assert.equal(roleHasCapability("Admin", "executeSql"), true);
  assert.equal(roleHasCapability("Editor", "executeSql"), false);
  assert.equal(roleHasCapability("Viewer", "executeSql"), false);
  assert.equal(roleHasCapability("Owner", "manageSchema"), true);
  assert.equal(roleHasCapability("Admin", "manageSchema"), true);
  assert.equal(roleHasCapability("Editor", "manageSchema"), false);
  assert.equal(roleHasCapability("Viewer", "manageSchema"), false);
  assert.deepEqual(
    APP_ROLES.map((role) => roleHasCapability(role, "mutateTableData")),
    [true, true, true, false]
  );
  assert.deepEqual(
    APP_ROLES.map((role) => roleHasCapability(role, "readStorage")),
    [true, true, true, true]
  );
  assert.deepEqual(
    APP_ROLES.map((role) => roleHasCapability(role, "writeStorage")),
    [true, true, true, false]
  );
  assert.deepEqual(
    APP_ROLES.map((role) => roleHasCapability(role, "manageStorage")),
    [true, true, false, false]
  );
  assert.ok(Object.keys(ROLE_CAPABILITY_DESCRIPTIONS).every((capability) =>
    APP_ROLES.every((role) => typeof ROLE_CAPABILITIES[role][capability] === "boolean")
  ));
});

test("demo identity is a dedicated fixture and never derived from the authenticated user", () => {
  const demoIdentity = DEMO_TEAM_MEMBERS.find((member) => member.id === DEMO_CURRENT_USER_ID);
  assert.ok(demoIdentity);
  assert.equal(demoIdentity.role, "Owner");
  assert.match(demoIdentity.email, /@example\.test$/);
  assert.match(DEMO_MODE_COPY.title, /Demo/);
  assert.match(DEMO_MODE_COPY.warning, /not persisted or enforced/);
  assert.match(DEMO_MODE_COPY.identityNote, /not your authenticated account/);
});

test("demo member lifecycle supports suspend, reactivate, and remove", () => {
  const starting = members();
  const suspended = toggleDemoMemberStatus(starting, DEMO_CURRENT_USER_ID, "demo-admin");
  assert.equal(suspended.ok, true);
  assert.equal(suspended.value.find((member) => member.id === "demo-admin").status, "suspended");
  const reactivated = toggleDemoMemberStatus(suspended.value, DEMO_CURRENT_USER_ID, "demo-admin");
  assert.equal(reactivated.ok, true);
  assert.equal(reactivated.value.find((member) => member.id === "demo-admin").status, "active");
  const removed = removeDemoMember(reactivated.value, DEMO_CURRENT_USER_ID, "demo-admin");
  assert.equal(removed.ok, true);
  assert.equal(removed.value.some((member) => member.id === "demo-admin"), false);
});

test("demo lifecycle rejects self actions, Owner promotion, and removing/demoting the final Owner", () => {
  const starting = members();
  assert.match(changeDemoMemberRole(starting, DEMO_CURRENT_USER_ID, DEMO_CURRENT_USER_ID, "Viewer").error, /identity/);
  assert.match(toggleDemoMemberStatus(starting, DEMO_CURRENT_USER_ID, DEMO_CURRENT_USER_ID).error, /identity/);
  assert.match(removeDemoMember(starting, DEMO_CURRENT_USER_ID, DEMO_CURRENT_USER_ID).error, /identity/);
  assert.match(changeDemoMemberRole(starting, DEMO_CURRENT_USER_ID, "demo-editor", "Owner").error, /cannot be assigned/);
  assert.match(changeDemoMemberRole(starting, "demo-admin", DEMO_CURRENT_USER_ID, "Viewer").error, /final demo Owner/);
  assert.match(removeDemoMember(starting, "demo-admin", DEMO_CURRENT_USER_ID).error, /final demo Owner/);

  const withoutDemoIdentity = starting.filter((member) => member.id !== DEMO_CURRENT_USER_ID);
  const withSoleOwner = [
    ...withoutDemoIdentity,
    { id: "only-owner", name: "Only Owner", email: "owner@example.test", role: "Owner", status: "active", lastActive: null },
  ];
  assert.match(changeDemoMemberRole(withSoleOwner, "demo-admin", "only-owner", "Editor").error, /final demo Owner/);
  assert.match(toggleDemoMemberStatus(withSoleOwner, "demo-admin", "only-owner").error, /final demo Owner/);
  assert.match(removeDemoMember(withSoleOwner, "demo-admin", "only-owner").error, /final demo Owner/);
});

test("demo invitation validates address and explicit allowed role, prevents duplicates, and remains local data", () => {
  const roster = members();
  assert.equal(validateDemoInvitation("not-an-email", "Editor", roster, []).ok, false);
  assert.equal(validateDemoInvitation("new@example.test", "", roster, []).ok, false);
  assert.equal(validateDemoInvitation("new@example.test", "Owner", roster, []).ok, false);
  assert.equal(validateDemoInvitation("AMELIA@EXAMPLE.TEST", "Viewer", roster, []).ok, false);

  const created = createDemoInvitation(" NewPerson@Example.test ", "Editor", roster, [], "local-invite-1", "2026-10-02T12:00:00Z");
  assert.equal(created.ok, true);
  assert.deepEqual(DEMO_INVITABLE_ROLES, ["Admin", "Editor", "Viewer"]);
  assert.deepEqual(created.value, {
    source: "demo",
    id: "local-invite-1",
    email: "newperson@example.test",
    role: "Editor",
    createdAt: "2026-10-02T12:00:00Z",
    status: "pending",
  });
  assert.equal(roster.some((member) => member.email === created.value.email), false);
  assert.match(validateDemoInvitation(created.value.email, "Editor", roster, [created.value]).error, /already present/);
});

test("resource permission examples cover member-associated schema, table, and bucket scopes", () => {
  const permissions = createInitialDemoPermissions(members());
  assert.deepEqual(new Set(permissions.map((permission) => permission.type)), new Set(["schema", "table", "bucket"]));
  assert.deepEqual(new Set(permissions.map((permission) => permission.memberId)), new Set(DEMO_TEAM_MEMBERS.map((member) => member.id)));
  for (const permission of permissions) {
    const member = DEMO_TEAM_MEMBERS.find((candidate) => candidate.id === permission.memberId);
    assert.ok(member);
    assert.equal(permission.role, member.role);
    assert.ok(DEMO_RESOURCES.some((resource) =>
      resource.id === permission.id.slice(permission.memberId.length + 1) &&
      resource.type === permission.type &&
      resource.name === permission.name
    ));
    assert.ok(DEMO_PERMISSION_LEVELS.includes(permission.level));
    assert.equal(permission.source, "demo");
  }

  const target = permissions.find((permission) => permission.memberId === "demo-editor" && permission.type === "table");
  const changed = changeDemoPermission(permissions, target.id, "none");
  assert.equal(changed.ok, true);
  assert.equal(changed.value.find((permission) => permission.id === target.id).level, "none");
  assert.equal(permissions.find((permission) => permission.id === target.id).level, "edit");
  assert.equal(changeDemoPermission(permissions, "unknown", "view").ok, false);
  assert.equal(changeDemoPermission(permissions, target.id, "invalid").ok, false);
});

test("demo RLS samples expose schema, policy semantics and no-policy state without implying live results", () => {
  const qualifiedNames = DEMO_RLS_TABLES.map((table) => `${table.schema}.${table.table}`);
  assert.equal(new Set(qualifiedNames).size, qualifiedNames.length);
  const withPolicies = DEMO_RLS_TABLES.flatMap((table) => table.policies);
  assert.ok(withPolicies.some((policy) => policy.using !== null));
  assert.ok(withPolicies.some((policy) => policy.withCheck !== null));
  assert.ok(withPolicies.some((policy) => policy.command === "SELECT"));
  assert.ok(withPolicies.some((policy) => policy.roles.includes("app_user")));
  assert.ok(withPolicies.some((policy) => policy.mode === "permissive"));
  assert.ok(withPolicies.some((policy) => policy.mode === "restrictive"));
  assert.ok(DEMO_RLS_TABLES.some((table) => table.rlsEnabled && table.forceRls));
  assert.ok(DEMO_RLS_TABLES.some((table) => !table.rlsEnabled && !table.forceRls));
  assert.ok(DEMO_RLS_TABLES.some((table) => table.policies.length === 0));
});

test("demo collection state distinguishes loading, error, empty, and ready for retry/reset handling", () => {
  assert.deepEqual(getDemoViewState(true, null, []), { kind: "loading" });
  assert.deepEqual(getDemoViewState(false, "Demo load failed", []), { kind: "error", message: "Demo load failed" });
  assert.deepEqual(getDemoViewState(false, null, []), { kind: "empty" });
  assert.deepEqual(getDemoViewState(false, null, [1, 2]), { kind: "ready", items: [1, 2] });
});

test("reset restores the local demo baseline without persistent side effects", () => {
  const state = createInitialDemoWorkspaceState();
  assert.deepEqual(state.invitations, []);
  assert.equal(state.selectedMemberId, DEMO_CURRENT_USER_ID);
  assert.deepEqual(state.members.map((member) => member.id), DEMO_TEAM_MEMBERS.map((member) => member.id));
  assert.equal(state.permissions.length, DEMO_TEAM_MEMBERS.length * DEMO_RESOURCES.length);
  assert.ok(state.permissions.every((permission) => permission.source === "demo"));
});
