import type { SessionUser } from "@/lib/auth/session";

export type SchemaMutationRole = "Owner" | "Admin";

/**
 * Schema/DDL changes are high-impact operations. Only Owner/Admin users
 * may execute them. Editor/Viewer accounts remain read/data-only.
 */
export function canManageSchema(user: SessionUser): boolean {
  return user.role === "Owner" || user.role === "Admin";
}

/** Arbitrary SQL may change or remove data, so only Owner/Admin can execute it. */
export function canExecuteSql(user: SessionUser): boolean {
  return user.role === "Owner" || user.role === "Admin";
}

export function sqlExecutionDeniedResponse(user: SessionUser): string {
  return `Your role (${user.role}) is not allowed to execute SQL. Owner or Admin access is required.`;
}

export function schemaMutationDeniedResponse(user: SessionUser): string {
  return `Your role (${user.role}) is not allowed to change database structure. Owner or Admin access is required.`;
}

/** Editors may change table data; viewers are read-only. */
export function canMutateTableData(user: SessionUser): boolean {
  return user.role === "Owner" || user.role === "Admin" || user.role === "Editor";
}

export function tableDataMutationDeniedResponse(user: SessionUser): string {
  return `Your role (${user.role}) is read-only and cannot change table data.`;
}
