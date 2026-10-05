/**
 * Browser-first authorize round-trip state. The external app redirects
 * the browser to the authorize endpoint; the server stores the pending
 * request (project, trusted redirect, PKCE challenge, opaque app state)
 * in short-lived HttpOnly cookies and 302s straight to Google. No
 * server-side POST or pre-existing cookie is required.
 */

export const PAUTH_STATE_COOKIE = "protodb_pauth_state";
export const PAUTH_REQUEST_COOKIE = "protodb_pauth_request";
export const PAUTH_COOKIE_PATH = "/api/projects";

export interface AuthorizeRequestContext {
  projectId: string;
  redirectUri: string;
  codeChallenge: string;
  appState: string | null;
}

export function encodeRequestContext(ctx: AuthorizeRequestContext): string {
  return Buffer.from(JSON.stringify(ctx), "utf8").toString("base64url");
}

export function parseRequestContext(value: unknown): AuthorizeRequestContext | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const ctx = parsed as Record<string, unknown>;
    if (
      typeof ctx.projectId !== "string" ||
      typeof ctx.redirectUri !== "string" ||
      typeof ctx.codeChallenge !== "string" ||
      !(ctx.appState === null || typeof ctx.appState === "string")
    ) {
      return null;
    }
    return {
      projectId: ctx.projectId,
      redirectUri: ctx.redirectUri,
      codeChallenge: ctx.codeChallenge,
      appState: ctx.appState,
    };
  } catch {
    return null;
  }
}
