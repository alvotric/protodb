import { authenticateProjectRequest, type ProjectAuthContext } from "./sessions.ts";

/**
 * Server-side session verification primitive for project auth.
 *
 * Validates an opaque access token against one project scope and returns
 * the session + active user. Rejects revoked/expired tokens, suspended
 * users, and cross-project tokens (projectId is always part of the
 * lookup — a client-supplied user_id is never trusted).
 *
 * External backends (e.g. Alvotric server code) that cannot import this
 * module should use the HTTP equivalent instead:
 *   GET /api/projects/{slug}/auth/v1/user  (Authorization: Bearer <token>)
 */
export async function verifyProjectSession(input: {
  projectId: string;
  token: unknown;
}): Promise<ProjectAuthContext | null> {
  if (typeof input.token !== "string" || !/^[0-9a-f]{64}$/i.test(input.token)) return null;
  if (typeof input.projectId !== "string" || input.projectId.length === 0) return null;
  return authenticateProjectRequest(input.projectId, input.token).catch(() => null);
}
