/**
 * Storage tenancy scope — control-plane boundary definition.
 *
 * CURRENT MODEL (single shared scope):
 * - There are no workspace/project tables in the database. All storage
 *   metadata (`storage_buckets`, `storage_objects`,
 *   `storage_upload_reservations`) lives in one shared scope.
 * - Authorization inside that scope is role-based
 *   (`lib/auth/role-capabilities.ts` via `canReadStorage`,
 *   `canWriteStorage`, `canManageStorage`): any active account with the
 *   capability may operate on any bucket/object. Buckets record
 *   `created_by` and objects record `uploaded_by` for attribution, but
 *   those columns are NOT access boundaries today.
 * - Upload reservations ARE per-user (`user_id` is always taken from the
 *   server session, never from client input): one user cannot finalize
 *   or cancel another user's reservation.
 *
 * FUTURE MULTI-TENANT WIRING (explicit extension points, not implemented):
 * - Desired hierarchy: User → Workspace → Project → Bucket → Object.
 * - When workspace/project persistence lands, it must provide:
 *   1. `workspaceId` / `projectId` identifiers stable across requests,
 *   2. a membership check `canAccessScope(userId, scope)` enforced
 *      server-side on EVERY storage operation (list/create/read/update/
 *      delete buckets and objects, reservations, signed access),
 *   3. a backfill/migration mapping each existing bucket to its owning
 *      scope (requires a real schema migration — none is created here).
 * - Until then, `resolveStorageScope()` below returns the shared global
 *   scope, and service/route code must NOT accept scope, owner, or user
 *   identifiers from client input.
 *
 * PROCESS-LOCAL / SCALE NOTES:
 * - PostgreSQL advisory locks (`pg_advisory_xact_lock`) are the
 *   cross-process serialization mechanism for quota/finalize races and
 *   remain correct with many app instances. The memoized provider client
 *   and the SQL-editor concurrency slots are per-process by design.
 * - True large-scale operation additionally needs: a scheduled
 *   worker for reservation/object reconciliation (today opportunistic on
 *   bucket/object listing), per-workspace quotas and usage metering for
 *   billing, provider webhook/lifecycle integration, and malware/content
 *   scanning as a later platform layer. None of those are claimed here.
 */

export type StorageScopeKind = "global" | "workspace" | "project";

export interface StorageScope {
  readonly kind: StorageScopeKind;
  /** Present only for workspace/project scopes once tenancy exists. */
  readonly workspaceId?: string;
  /** Present only for project scopes once tenancy exists. */
  readonly projectId?: string;
}

export const GLOBAL_STORAGE_SCOPE: StorageScope = { kind: "global" };

/**
 * Resolve the storage scope for the current request. Today there is
 * exactly one scope: the shared global scope. The signature already
 * accepts an (ignored) context parameter so future workspace/project
 * resolution can land without changing call sites' shape.
 */
export function resolveStorageScope(context?: { userId: string }): StorageScope {
  void context;
  return GLOBAL_STORAGE_SCOPE;
}

/** Stable audit/resource label for a scope. Never includes secrets. */
export function scopeAuditLabel(scope: StorageScope): string {
  if (scope.kind === "project" && scope.workspaceId && scope.projectId) {
    return `workspace:${scope.workspaceId}/project:${scope.projectId}`;
  }
  if (scope.kind === "workspace" && scope.workspaceId) {
    return `workspace:${scope.workspaceId}`;
  }
  return "global";
}

/**
 * Guard helper for future scoped enforcement. Today it only asserts the
 * known global scope so multi-tenant checks cannot be silently skipped
 * once workspace/project scopes exist: callers must handle non-global
 * scopes explicitly instead of falling through to shared access.
 */
export function assertGlobalScope(scope: StorageScope, operation: string): void {
  if (scope.kind !== "global") {
    throw new Error(
      `Storage scope enforcement is not implemented for ${scope.kind} scopes (${operation}).`
    );
  }
}
