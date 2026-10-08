/** Public types for @protodb/auth-js. Browser-safe: no secrets, no Node APIs. */
export interface ProtoDBClientOptions {
    /** ProtoDB deployment origin, e.g. "http://localhost:3000". No trailing slash handling needed. */
    url: string;
    /** Project slug, e.g. "alvotric". */
    project: string;
    /** Override the localStorage key namespace. Defaults to a url+project scoped key. */
    storageKey?: string;
    /** Custom key-value store (defaults to localStorage with in-memory fallback). */
    storage?: AuthStorage;
    /** Custom fetch implementation (defaults to global fetch). */
    fetch?: typeof fetch;
    /** Automatically refresh an expiring access token. Defaults to true. */
    autoRefresh?: boolean;
}
export interface AuthStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export interface AuthUser {
    id: string;
    email: string;
    email_verified?: boolean;
    name?: string | null;
}
export interface AuthSession {
    access_token: string;
    refresh_token: string;
    /** Milliseconds since epoch when the access token expires. */
    expires_at: number;
    expires_in: number;
    token_type: string;
    user: AuthUser;
}
export type AuthChangeEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED";
export interface SignInOptions {
    /**
     * Where ProtoDB redirects back after Google sign-in.
     * Must be registered exactly in the project's Allowed Redirect URLs.
     * Defaults to the current page URL (without query or hash).
     */
    redirectTo?: string;
    /** Opaque app state echoed back through the flow (max 512 chars). */
    state?: string;
}
export interface SignUpOptions {
    email: string;
    password: string;
    /** Full name stored on the project user (max 100 chars, optional). */
    name?: string;
    /**
     * Base URL of the app's email-verification page. ProtoDB appends
     * `?token=…&type=verify`. Should be registered in the project's
     * Allowed Redirect URLs.
     */
    redirectTo?: string;
}
export interface SignUpResult {
    user: AuthUser;
    message: string;
}
export interface PasswordSignInOptions {
    email: string;
    password: string;
}
export interface ResetPasswordOptions {
    /**
     * Base URL of the app's password-reset page. ProtoDB appends
     * `?token=…&type=recovery`. Should be registered in the project's
     * Allowed Redirect URLs.
     */
    redirectTo?: string;
}
export interface VerifyEmailResult {
    user: AuthUser;
}
export interface UpdatePasswordOptions {
    /**
     * Session mode: set a new password for the signed-in user.
     * `currentPassword` is required when the account already has one.
     */
    currentPassword?: string;
    /** New password (min 8 chars). */
    newPassword: string;
    /**
     * Recovery mode: complete a password reset with a recovery token
     * instead of a session. All sessions are revoked.
     */
    token?: string;
}
export interface DeleteAccountOptions {
    /** Required when the account has a password. */
    password?: string;
}
export interface HandleCallbackOptions {
    /** Full callback URL. Defaults to window.location.href (browser only). */
    url?: string;
    /** Strip code/state from the address bar after success. Defaults to true. */
    cleanupUrl?: boolean;
}
export interface SignOutOptions {
    /** "global" revokes every session in the family. Defaults to "global". */
    scope?: "local" | "global";
}
