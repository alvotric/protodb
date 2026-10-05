import { createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";

/**
 * Google OAuth/OIDC login for the EXISTING ProtoDB auth system.
 *
 * Google is only an identity provider. A successful Google flow always
 * ends in the SAME session mechanism as password login
 * (`lib/auth/session.ts#createSession`, same `protodb_session` cookie),
 * so getCurrentUser(), middleware, logout, revocation, expiry, roles,
 * and suspended-user checks behave identically.
 *
 * This module is intentionally free of Next.js and database imports so
 * its pure parts (state handling, claim verification, mapping
 * decisions) stay unit-testable. Cookie I/O and SQL live in the route
 * handlers (`app/api/auth/google/*`).
 */

export const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"] as const;

export const OAUTH_STATE_COOKIE = "protodb_oauth_state";
export const OAUTH_INTENT_COOKIE = "protodb_oauth_intent";
/** OAuth round-trip must complete within 10 minutes. */
export const OAUTH_STATE_TTL_SECONDS = 600;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Reads server-side env at call time (never at import time, so tests can stub). */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() !== null;
}

export type OAuthIntent = { kind: "login" } | { kind: "link"; userId: string };

/** 256-bit cryptographically random OAuth state. */
export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}

export function buildAuthorizationUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

/** Encodes the post-callback intent into an HttpOnly cookie value. Never trust client intent beyond this. */
export function encodeIntentCookie(intent: OAuthIntent): string {
  return intent.kind === "login" ? "login" : `link:${intent.userId}`;
}

const INTENT_LINK_PATTERN = /^link:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function parseIntentCookie(value: unknown): OAuthIntent | null {
  if (value !== "login" && typeof value !== "string") return null;
  if (value === "login") return { kind: "login" };
  const match = INTENT_LINK_PATTERN.exec(value as string);
  return match ? { kind: "link", userId: match[1] } : null;
}

/** Constant-time state comparison; rejects malformed values without throwing. */
export function statesEqual(expected: unknown, actual: unknown): boolean {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  if (!/^[0-9a-f]{64}$/i.test(expected) || !/^[0-9a-f]{64}$/i.test(actual)) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class OAuthCallbackError extends Error {
  readonly publicCode: string;
  constructor(publicCode: string, detail?: string) {
    super(detail ?? publicCode);
    this.name = "OAuthCallbackError";
    this.publicCode = publicCode;
  }
}

export interface CallbackParams {
  code: string | null;
  state: string | null;
  providerError: string | null;
}

/** Reads Google's redirect query without trusting anything in it yet. */
export function parseCallbackParams(searchParams: URLSearchParams): CallbackParams {
  return {
    code: searchParams.get("code"),
    state: searchParams.get("state"),
    providerError: searchParams.get("error"),
  };
}

interface TokenResponse {
  id_token?: unknown;
}

/** Exchanges the authorization code server-side. Tokens never reach the browser. */
export async function exchangeCodeForIdToken(
  config: GoogleOAuthConfig,
  code: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  let response: Response;
  try {
    response = await fetchFn(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OAuthCallbackError("token_exchange_failed", "Could not reach Google's token endpoint.");
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    throw new OAuthCallbackError("token_exchange_failed", "Google's token endpoint returned an invalid response.");
  }
  if (!response.ok) {
    throw new OAuthCallbackError("token_exchange_failed", "Google rejected the authorization code.");
  }
  const idToken = (body as TokenResponse)?.id_token;
  if (typeof idToken !== "string" || idToken.length === 0) {
    throw new OAuthCallbackError("token_exchange_failed", "Google returned no identity token.");
  }
  return idToken;
}

export interface GoogleIdentity {
  /** Stable Google subject — the ONLY permanent identity key. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

function base64UrlDecode(segment: string): Buffer {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

interface JwksKey {
  kid?: unknown;
  x5c?: unknown;
}

async function fetchJwks(fetchFn: typeof fetch): Promise<JwksKey[]> {
  const response = await fetchFn(GOOGLE_JWKS_URI, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new OAuthCallbackError("identity_verification_failed", "Could not load Google's signing keys.");
  const body: unknown = await response.json().catch(() => null);
  const keys = (body as { keys?: unknown })?.keys;
  if (!Array.isArray(keys)) throw new OAuthCallbackError("identity_verification_failed", "Google's signing keys were malformed.");
  return keys as JwksKey[];
}

let cachedJwks: { fetchedAt: number; keys: JwksKey[] } | null = null;
const JWKS_CACHE_MS = 60 * 60 * 1000;

async function getJwksKey(
  kid: string,
  fetchFn: typeof fetch,
  allowRefresh: boolean
): Promise<JwksKey | null> {
  const fresh = cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_CACHE_MS ? cachedJwks : null;
  const keys = fresh ? fresh.keys : await fetchJwks(fetchFn).then((loaded) => {
    cachedJwks = { fetchedAt: Date.now(), keys: loaded };
    return loaded;
  });
  const found = keys.find((key) => key.kid === kid) ?? null;
  if (found || !allowRefresh) return found;
  cachedJwks = null;
  return getJwksKey(kid, fetchFn, false);
}

export interface VerifyOptions {
  clientId: string;
  fetchFn?: typeof fetch;
  /** Injected clock for tests (milliseconds since epoch). */
  nowMs?: number;
  /** Injected JWKS for tests (skips network). */
  jwksKeys?: JwksKey[];
}

/**
 * Verifies a Google ID token per OIDC: RS256 signature against Google's
 * JWKS, issuer, audience (our client ID), expiry, and verified email.
 * Fails closed on anything unexpected. Requires email_verified — an
 * unverified Google email proves nothing about mailbox control.
 */
export async function verifyGoogleIdToken(idToken: string, options: VerifyOptions): Promise<GoogleIdentity> {
  const fail = (detail: string): never => {
    throw new OAuthCallbackError("identity_verification_failed", detail);
  };
  const parts = idToken.split(".");
  if (parts.length !== 3) fail("Malformed identity token.");
  let header: { alg?: unknown; kid?: unknown };
  let payload: { iss?: unknown; aud?: unknown; exp?: unknown; sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown };
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8")) as typeof header;
    payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as typeof payload;
  } catch {
    fail("Identity token payload is not valid JSON.");
  }
  if (header!.alg !== "RS256") fail("Unexpected identity token algorithm.");
  if (typeof header!.kid !== "string" || header!.kid.length === 0) fail("Identity token has no key ID.");
  const fetchFn = options.fetchFn ?? fetch;
  const jwk = options.jwksKeys?.find((key) => key.kid === header!.kid) ??
    await getJwksKey(header!.kid as string, fetchFn, true).catch(() => null);
  if (!jwk || !Array.isArray(jwk.x5c) || typeof jwk.x5c[0] !== "string") {
    fail("Identity token signing key is unknown.");
  }
  let signatureValid = false;
  try {
    // Real Google JWKS entries carry X.509 certificates; accept a bare
    // SPKI public key as well so verification stays testable without a CA.
    let publicKey = null;
    for (const pem of [
      `-----BEGIN CERTIFICATE-----\n${(jwk!.x5c as string[])[0]}\n-----END CERTIFICATE-----\n`,
      `-----BEGIN PUBLIC KEY-----\n${(jwk!.x5c as string[])[0]}\n-----END PUBLIC KEY-----\n`,
    ]) {
      try {
        publicKey = createPublicKey({ key: pem });
        break;
      } catch {
        publicKey = null;
      }
    }
    if (!publicKey) fail("Identity token signing key is unusable.");
    signatureValid = verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
      publicKey!,
      base64UrlDecode(parts[2])
    );
  } catch (error) {
    if (error instanceof OAuthCallbackError) throw error;
    fail("Identity token signature could not be checked.");
  }
  if (!signatureValid) fail("Identity token signature is invalid.");

  if (!(GOOGLE_ISSUERS as readonly unknown[]).includes(payload!.iss)) fail("Unexpected identity token issuer.");
  const audience = payload!.aud;
  const audienceOk = audience === options.clientId ||
    (Array.isArray(audience) && audience.includes(options.clientId));
  if (!audienceOk) fail("Identity token was not issued to this application.");
  const nowMs = options.nowMs ?? Date.now();
  if (typeof payload!.exp !== "number" || payload!.exp * 1000 <= nowMs - 60_000) {
    fail("Identity token is expired.");
  }
  if (typeof payload!.sub !== "string" || payload!.sub.length === 0) fail("Identity token has no subject.");
  if (typeof payload!.email !== "string" || payload!.email.length === 0) fail("Identity token has no email.");
  if (payload!.email_verified !== true) fail("Google email address is not verified.");

  return {
    sub: payload!.sub as string,
    email: (payload!.email as string).trim().toLowerCase(),
    emailVerified: true,
    name: typeof payload!.name === "string" && payload!.name.trim() ? payload!.name.trim() : null,
  };
}

/** Clears the JWKS cache (tests only). */
export function clearJwksCacheForTests(): void {
  cachedJwks = null;
}

export interface LinkedUser {
  id: string;
  email: string;
  status: string;
}

export interface EmailMatchedUser {
  id: string;
  email: string;
  status: string;
}

export type LoginDecision =
  | { kind: "login"; userId: string }
  | { kind: "bootstrap" }
  | { kind: "reject"; reason: "suspended" | "email-conflict" | "no-account" };

/**
 * Pure mapping decision shared by the callback route and unit tests.
 * - Linked subject → log that user in (suspended still rejected).
 * - Empty user table → first-run bootstrap (caller creates Owner atomically).
 * - Email matches but subject unlinked → NEVER merge; caller must ask for
 *   password sign-in / authenticated linking instead.
 * - Otherwise → reject (this product has no self-signup past bootstrap).
 */
export function decideGoogleLogin(input: {
  linkedUser: LinkedUser | null;
  emailMatchedUser: EmailMatchedUser | null;
  usersEmpty: boolean;
}): LoginDecision {
  if (input.linkedUser) {
    if (input.linkedUser.status === "suspended") return { kind: "reject", reason: "suspended" };
    return { kind: "login", userId: input.linkedUser.id };
  }
  if (input.usersEmpty) return { kind: "bootstrap" };
  if (input.emailMatchedUser) {
    if (input.emailMatchedUser.status === "suspended") return { kind: "reject", reason: "suspended" };
    return { kind: "reject", reason: "email-conflict" };
  }
  return { kind: "reject", reason: "no-account" };
}
