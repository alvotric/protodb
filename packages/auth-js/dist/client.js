import { ProtoDBAuthError } from "./errors.js";
import { challengeForVerifier, generateState, generateVerifier } from "./pkce.js";
import { defaultStorage } from "./storage.js";
const REFRESH_LEEWAY_MS = 60000;
function currentWindowLocation() {
    if (typeof window === "undefined" || !window.location) {
        throw new ProtoDBAuthError("browser-required", "This method needs a browser (window.location).");
    }
    return window.location;
}
export class ProtoDBAuthClient {
    constructor(options) {
        this.listeners = new Set();
        this.refreshPromise = null;
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
    get basePath() {
        return `${this.url}/api/projects/${encodeURIComponent(this.project)}/auth/v1`;
    }
    /** Subscribe to session changes. Returns an unsubscribe function. */
    onAuthStateChange(callback) {
        this.listeners.add(callback);
        return { unsubscribe: () => { this.listeners.delete(callback); } };
    }
    notify(event, session) {
        for (const listener of this.listeners) {
            try {
                listener(event, session);
            }
            catch {
                // A subscriber must never break auth state transitions.
            }
        }
    }
    readSession() {
        try {
            const raw = this.storage.getItem(this.sessionKey);
            if (!raw)
                return null;
            const parsed = JSON.parse(raw);
            if (typeof parsed.access_token !== "string" ||
                typeof parsed.refresh_token !== "string" ||
                typeof parsed.expires_at !== "number") {
                return null;
            }
            return parsed;
        }
        catch {
            return null;
        }
    }
    writeSession(session) {
        if (!session)
            this.storage.removeItem(this.sessionKey);
        else
            this.storage.setItem(this.sessionKey, JSON.stringify(session));
    }
    readPending() {
        try {
            const raw = this.storage.getItem(this.pendingKey);
            if (!raw)
                return null;
            const parsed = JSON.parse(raw);
            if (typeof parsed.verifier !== "string" || typeof parsed.state !== "string" || typeof parsed.redirectTo !== "string") {
                return null;
            }
            return parsed;
        }
        catch {
            return null;
        }
    }
    /**
     * Start Google sign-in: builds PKCE + state, stores the verifier, and
     * redirects the browser to ProtoDB (which forwards to Google).
     * Returns the ProtoDB authorize URL (handy for tests/custom flows).
     */
    async signInWithGoogle(options = {}) {
        const location = currentWindowLocation();
        const redirectTo = options.redirectTo ?? `${location.origin}${location.pathname}`;
        const state = options.state ?? generateState();
        if (state.length > 512) {
            throw new ProtoDBAuthError("invalid-options", "state must not exceed 512 characters.");
        }
        const verifier = await generateVerifier();
        const challenge = await challengeForVerifier(verifier);
        this.storage.setItem(this.pendingKey, JSON.stringify({ verifier, state, redirectTo }));
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
    async handleCallback(options = {}) {
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
        if (options.cleanupUrl ?? true)
            this.cleanupUrl(url);
        this.notify("SIGNED_IN", session);
        return { session, user: session.user };
    }
    /** Current session, refreshing an expiring access token when possible. */
    async getSession() {
        const stored = this.readSession();
        if (!stored)
            return null;
        if (this.autoRefresh && stored.expires_at - Date.now() < REFRESH_LEEWAY_MS) {
            try {
                return await this.refreshSession();
            }
            catch {
                return null;
            }
        }
        return stored;
    }
    /** Current user, refreshed from the server when a session exists. */
    async getUser() {
        const session = await this.getSession();
        if (!session)
            return null;
        const response = await this.fetchFn(`${this.basePath}/user`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => null);
        if (!response || !response.ok)
            return session.user;
        const body = (await response.json().catch(() => null));
        if (!body || typeof body.user !== "object" || body.user === null)
            return session.user;
        const user = body.user;
        const updated = { ...session, user };
        this.writeSession(updated);
        this.notify("USER_UPDATED", updated);
        return user;
    }
    /** Rotate the refresh token pair. Invalid grants clear local state. */
    async refreshSession() {
        if (this.refreshPromise)
            return this.refreshPromise;
        const run = async () => {
            const stored = this.readSession();
            if (!stored) {
                throw new ProtoDBAuthError("no-session", "No active session to refresh.");
            }
            const body = await this.postJson(`${this.basePath}/token`, {
                grant_type: "refresh_token",
                refresh_token: stored.refresh_token,
            });
            const session = {
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
        }
        catch (error) {
            if (error instanceof ProtoDBAuthError && (error.code === "invalid_grant" || error.code === "invalid_token")) {
                this.writeSession(null);
                this.notify("SIGNED_OUT", null);
            }
            throw error;
        }
        finally {
            this.refreshPromise = null;
        }
    }
    /**
     * Email/password signup. Creates an unverified project user and asks
     * ProtoDB to email a verification link. No session is created — the
     * user signs in after verifying (or immediately if already verified).
     */
    async signUp(options) {
        const body = await this.postJson(`${this.basePath}/signup`, {
            ...(options.redirectTo ? { redirect_to: options.redirectTo } : {}),
            email: options.email,
            password: options.password,
            ...(options.name !== undefined ? { name: options.name } : {}),
        });
        const user = body.user;
        const message = body.message;
        if (!user || typeof user.id !== "string" || typeof user.email !== "string") {
            throw new ProtoDBAuthError("invalid-response", "Signup returned an invalid response.");
        }
        return {
            user: { id: user.id, email: user.email },
            message: typeof message === "string" ? message : "Account created.",
        };
    }
    /**
     * Email/password login. Verified accounts only — unverified addresses
     * get a distinct error so the app can prompt verification.
     */
    async signInWithPassword(options) {
        const body = await this.postJson(`${this.basePath}/token`, {
            grant_type: "password",
            email: options.email,
            password: options.password,
        });
        const session = this.sessionFromTokenResponse(body);
        this.writeSession(session);
        this.notify("SIGNED_IN", session);
        return { session, user: session.user };
    }
    /**
     * Requests a password-reset email. Always resolves without revealing
     * whether the address exists (server enforces the same).
     */
    async resetPasswordForEmail(email, options = {}) {
        await this.postJson(`${this.basePath}/recover`, {
            ...(options.redirectTo ? { redirect_to: options.redirectTo } : {}),
            email,
        });
    }
    /** Completes email verification with a single-use token. */
    async verifyEmail(token) {
        const body = await this.postJson(`${this.basePath}/verify`, { token });
        const user = body.user;
        if (!user || typeof user.id !== "string") {
            throw new ProtoDBAuthError("invalid-response", "Verification returned an invalid response.");
        }
        return { user: { id: user.id, email: typeof user.email === "string" ? user.email : "" } };
    }
    /**
     * Updates the password. Session mode (signed in, optional current
     * password check) or recovery mode (single-use token; revokes every
     * session including any local one).
     */
    async updatePassword(options) {
        if (options.token) {
            await this.postJson(`${this.basePath}/update-password`, {
                token: options.token,
                new_password: options.newPassword,
            });
            this.writeSession(null);
            this.storage.removeItem(this.pendingKey);
            this.notify("SIGNED_OUT", null);
            return;
        }
        const stored = this.readSession();
        if (!stored) {
            throw new ProtoDBAuthError("no-session", "Sign in to change your password.");
        }
        const response = await this.fetchFn(`${this.basePath}/update-password`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${stored.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...(options.currentPassword !== undefined ? { current_password: options.currentPassword } : {}),
                new_password: options.newPassword,
            }),
        }).catch(() => null);
        if (!response) {
            throw new ProtoDBAuthError("network-error", "Could not reach the ProtoDB server.");
        }
        if (!response.ok) {
            const body = (await response.json().catch(() => null));
            const code = typeof body?.error === "string" ? body.error : "request-failed";
            const message = typeof body?.error_description === "string" ? body.error_description : "Password could not be updated.";
            throw new ProtoDBAuthError(code, message);
        }
    }
    /**
     * Real account deletion (not a stub). Password accounts confirm with
     * their current password. Always clears local state.
     */
    async deleteAccount(options = {}) {
        const stored = this.readSession();
        if (!stored) {
            throw new ProtoDBAuthError("no-session", "Sign in to delete your account.");
        }
        const response = await this.fetchFn(`${this.basePath}/user`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${stored.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...(options.password !== undefined ? { password: options.password } : {}),
            }),
        }).catch(() => null);
        if (response && !response.ok) {
            const body = (await response.json().catch(() => null));
            const code = typeof body?.error === "string" ? body.error : "request-failed";
            if (code === "password_required" || code === "password_invalid") {
                const message = typeof body?.error_description === "string" ? body.error_description : "Account could not be deleted.";
                throw new ProtoDBAuthError(code, message);
            }
            // Otherwise best-effort: fall through and clear local state.
        }
        this.writeSession(null);
        this.storage.removeItem(this.pendingKey);
        this.notify("SIGNED_OUT", null);
    }
    /** Revoke server-side (best-effort) and always clear local state. */
    async signOut(options = {}) {
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
    sessionFromTokenResponse(body) {
        if (typeof body.access_token !== "string" ||
            typeof body.refresh_token !== "string" ||
            typeof body.expires_in !== "number") {
            throw new ProtoDBAuthError("invalid-response", "Token endpoint returned an invalid response.");
        }
        const user = body.user;
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
    async postJson(endpoint, fields) {
        const response = await this.fetchFn(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
        }).catch(() => null);
        if (!response) {
            throw new ProtoDBAuthError("network-error", "Could not reach the ProtoDB server.");
        }
        const body = (await response.json().catch(() => null));
        if (!response.ok || !body) {
            const code = typeof body?.error === "string" ? body.error : "request-failed";
            const description = typeof body?.error_description === "string" ? body.error_description : undefined;
            const fallback = typeof body?.message === "string" ? body.message : "Token request failed.";
            const message = description ?? fallback;
            if (response.status === 401 || code === "invalid_grant") {
                throw new ProtoDBAuthError("invalid_grant", message);
            }
            throw new ProtoDBAuthError(code, message);
        }
        return body;
    }
    cleanupUrl(url) {
        try {
            if (typeof window === "undefined" || !window.history?.replaceState)
                return;
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            url.searchParams.delete("error");
            window.history.replaceState(null, "", url.toString());
        }
        catch {
            // Cosmetic only; never fail the sign-in over URL cleanup.
        }
    }
}
/** Create a ProtoDB Auth client for one project. No secrets involved — ever. */
export function createProtoDBClient(options) {
    return { auth: new ProtoDBAuthClient(options) };
}
