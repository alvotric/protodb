import { ProtoDBAuthError } from "./errors.ts";
import { challengeForVerifier, generateState, generateVerifier } from "./pkce.ts";
import { defaultStorage } from "./storage.ts";
import type {
  AuthChangeEvent,
  AuthSession,
  AuthStorage,
  AuthUser,
  HandleCallbackOptions,
  ProtoDBClientOptions,
  SignInOptions,
  SignOutOptions,
} from "./types.ts";

const REFRESH_LEEWAY_MS = 60_000;

interface PendingLogin {
  verifier: string;
  state: string;
  redirectTo: string;
}

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  user?: unknown;
}

type Listener = (event: AuthChangeEvent, session: AuthSession | null) => void;

function currentWindowLocation(): Location {
  if (typeof window === "undefined" || !window.location) {
    throw new ProtoDBAuthError("browser-required", "This method needs a browser (window.location).");
  }
  return window.location;
}

export class ProtoDBAuthClient {
  readonly url: string;
  readonly project: string;
  private readonly sessionKey: string;
  private readonly pendingKey: string;
  private readonly storage: AuthStorage;
  private readonly fetchFn: typeof fetch;
  private readonly autoRefresh: boolean;
  private readonly listeners = new Set<Listener>();
  private refreshPromise: Promise<AuthSession> | null = null;

  constructor(options: ProtoDBClientOptions) {
    if (!options || typeof options.url !== "string" || !options.url.trim()) {
      throw new ProtoDBAuthError("invalid-options", "createProtoDBClient requires a url.");
    }
    if (typeof options.project !== "string" || !options.project.trim()) {
      throw new ProtoDBAuthError("invalid-options", "createProtoDBClient requires a project slug.");
    }
    this.url = options.url.replace(/\/+$/, "");
    this.project = options.project.trim();
    const namespace = options.storageKey ?? `protodb.auth.session:${this.url}::${this.project}`;
    this.sessionKey = namespace;
    this.pendingKey = `${namespace}:pending`;
    this.storage = options.storage ?? defaultStorage();
    this.fetchFn = options.fetch ?? fetch.bind(globalThis);
    this.autoRefresh = options.autoRefresh ?? true;
  }

  private get basePath(): string {
    return `${this.url}/api/projects/${encodeURIComponent(this.project)}/auth/v1`;
  }

  /** Subscribe to session changes. Returns an unsubscribe function. */
  onAuthStateChange(callback: Listener): { unsubscribe: () => void } {
    this.listeners.add(callback);
    return { unsubscribe: () => { this.listeners.delete(callback); } };
  }

  private notify(event: AuthChangeEvent, session: AuthSession | null): void {
    for (const listener of this.listeners) {
      try {
        listener(event, session);
      } catch {
        // A subscriber must never break auth state transitions.
      }
    }
  }

  private readSession(): AuthSession | null {
    try {
      const raw = this.storage.getItem(this.sessionKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<AuthSession>;
      if (
        typeof parsed.access_token !== "string" ||
        typeof parsed.refresh_token !== "string" ||
        typeof parsed.expires_at !== "number"
      ) {
        return null;
      }
      return parsed as AuthSession;
    } catch {
      return null;
    }
  }

  private writeSession(session: AuthSession | null): void {
    if (!session) this.storage.removeItem(this.sessionKey);
    else this.storage.setItem(this.sessionKey, JSON.stringify(session));
  }

  private readPending(): PendingLogin | null {
    try {
      const raw = this.storage.getItem(this.pendingKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PendingLogin>;
      if (typeof parsed.verifier !== "string" || typeof parsed.state !== "string" || typeof parsed.redirectTo !== "string") {
        return null;
      }
      return parsed as PendingLogin;
    } catch {
      return null;
    }
  }

  /**
   * Start Google sign-in: builds PKCE + state, stores the verifier, and
   * redirects the browser to ProtoDB (which forwards to Google).
   * Returns the ProtoDB authorize URL (handy for tests/custom flows).
   */
  async signInWithGoogle(options: SignInOptions = {}): Promise<{ url: string }> {
    const location = currentWindowLocation();
    const redirectTo = options.redirectTo ?? `${location.origin}${location.pathname}`;
    const state = options.state ?? generateState();
    if (state.length > 512) {
      throw new ProtoDBAuthError("invalid-options", "state must not exceed 512 characters.");
    }
    const verifier = await generateVerifier();
    const challenge = await challengeForVerifier(verifier);
    this.storage.setItem(this.pendingKey, JSON.stringify({ verifier, state, redirectTo } satisfies PendingLogin));
    const params = new URLSearchParams({
      provider: "google",
      redirect_uri: redirectTo,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });
    const url = `${this.basePath}/authorize?${params.toString()}`;
    location.assign(url);
    return { url };
  }

  /**
   * Finish Google sign-in on the app's redirect page: validates state,
   * exchanges code + verifier for tokens, persists the session.
   */
  async handleCallback(options: HandleCallbackOptions = {}): Promise<{ session: AuthSession; user: AuthUser }> {
    const href = options.url ?? currentWindowLocation().href;
    const url = new URL(href);
    const params = url.searchParams;
    const providerError = params.get("error");
    if (providerError) {
      this.storage.removeItem(this.pendingKey);
      throw new ProtoDBAuthError(providerError, `Google sign-in failed (${providerError}).`);
    }
    const code = params.get("code");
    const returnedState = params.get("state");
    const pending = this.readPending();
    if (!code || !returnedState || !pending || returnedState !== pending.state) {
      this.storage.removeItem(this.pendingKey);
      throw new ProtoDBAuthError("state-mismatch", "Sign-in response could not be verified. Please try again.");
    }
    const body = await this.postJson(`${this.basePath}/token`, {
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirectTo,
      code_verifier: pending.verifier,
    });
    const session = this.sessionFromTokenResponse(body);
    this.writeSession(session);
    this.storage.removeItem(this.pendingKey);
    if (options.cleanupUrl ?? true) this.cleanupUrl(url);
    this.notify("SIGNED_IN", session);
    return { session, user: session.user };
  }

  /** Current session, refreshing an expiring access token when possible. */
  async getSession(): Promise<AuthSession | null> {
    const stored = this.readSession();
    if (!stored) return null;
    if (this.autoRefresh && stored.expires_at - Date.now() < REFRESH_LEEWAY_MS) {
      try {
        return await this.refreshSession();
      } catch {
        return null;
      }
    }
    return stored;
  }

  /** Current user, refreshed from the server when a session exists. */
  async getUser(): Promise<AuthUser | null> {
    const session = await this.getSession();
    if (!session) return null;
    const response = await this.fetchFn(`${this.basePath}/user`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => null);
    if (!response || !response.ok) return session.user;
    const body = (await response.json().catch(() => null)) as { user?: AuthUser } | null;
    if (!body || typeof body.user !== "object" || body.user === null) return session.user;
    const user = body.user as AuthUser;
    const updated: AuthSession = { ...session, user };
    this.writeSession(updated);
    this.notify("USER_UPDATED", updated);
    return user;
  }

  /** Rotate the refresh token pair. Invalid grants clear local state. */
  async refreshSession(): Promise<AuthSession> {
    if (this.refreshPromise) return this.refreshPromise;
    const run = async (): Promise<AuthSession> => {
      const stored = this.readSession();
      if (!stored) {
        throw new ProtoDBAuthError("no-session", "No active session to refresh.");
      }
      const body = await this.postJson(`${this.basePath}/token`, {
        grant_type: "refresh_token",
        refresh_token: stored.refresh_token,
      });
      const session: AuthSession = {
        ...this.sessionFromTokenResponse(body),
        user: stored.user,
      };
      this.writeSession(session);
      this.notify("TOKEN_REFRESHED", session);
      return session;
    };
    this.refreshPromise = run();
    try {
      return await this.refreshPromise;
    } catch (error) {
      if (error instanceof ProtoDBAuthError && (error.code === "invalid_grant" || error.code === "invalid_token")) {
        this.writeSession(null);
        this.notify("SIGNED_OUT", null);
      }
      throw error;
    } finally {
      this.refreshPromise = null;
    }
  }

  /** Revoke server-side (best-effort) and always clear local state. */
  async signOut(options: SignOutOptions = {}): Promise<void> {
    const stored = this.readSession();
    const scope = options.scope ?? "global";
    if (stored) {
      await this.fetchFn(`${this.basePath}/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stored.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope }),
      }).catch(() => null);
    }
    this.writeSession(null);
    this.storage.removeItem(this.pendingKey);
    this.notify("SIGNED_OUT", null);
  }

  private sessionFromTokenResponse(body: TokenResponse): AuthSession {
    if (
      typeof body.access_token !== "string" ||
      typeof body.refresh_token !== "string" ||
      typeof body.expires_in !== "number"
    ) {
      throw new ProtoDBAuthError("invalid-response", "Token endpoint returned an invalid response.");
    }
    const user = body.user as Partial<AuthUser> | undefined;
    if (!user || typeof user.id !== "string" || typeof user.email !== "string") {
      throw new ProtoDBAuthError("invalid-response", "Token endpoint returned an invalid user.");
    }
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: Date.now() + body.expires_in * 1000,
      expires_in: body.expires_in,
      token_type: "Bearer",
      user: { id: user.id, email: user.email },
    };
  }

  private async postJson(endpoint: string, fields: Record<string, string>): Promise<TokenResponse> {
    const response = await this.fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).catch(() => null);
    if (!response) {
      throw new ProtoDBAuthError("network-error", "Could not reach the ProtoDB server.");
    }
    const body = (await response.json().catch(() => null)) as (TokenResponse & { error?: unknown; error_description?: unknown }) | null;
    if (!response.ok || !body) {
      const code = typeof body?.error === "string" ? body.error : "request-failed";
      const message = typeof body?.error_description === "string" ? body.error_description : "Token request failed.";
      if (response.status === 401 || code === "invalid_grant") {
        throw new ProtoDBAuthError("invalid_grant", message);
      }
      throw new ProtoDBAuthError(code, message);
    }
    return body;
  }

  private cleanupUrl(url: URL): void {
    try {
      if (typeof window === "undefined" || !window.history?.replaceState) return;
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      url.searchParams.delete("error");
      window.history.replaceState(null, "", url.toString());
    } catch {
      // Cosmetic only; never fail the sign-in over URL cleanup.
    }
  }
}

/** Create a ProtoDB Auth client for one project. No secrets involved — ever. */
export function createProtoDBClient(options: ProtoDBClientOptions): { auth: ProtoDBAuthClient } {
  return { auth: new ProtoDBAuthClient(options) };
}
