import type { AuthChangeEvent, AuthSession, AuthUser, HandleCallbackOptions, ProtoDBClientOptions, SignInOptions, SignOutOptions } from "./types.ts";
type Listener = (event: AuthChangeEvent, session: AuthSession | null) => void;
export declare class ProtoDBAuthClient {
    readonly url: string;
    readonly project: string;
    private readonly sessionKey;
    private readonly pendingKey;
    private readonly storage;
    private readonly fetchFn;
    private readonly autoRefresh;
    private readonly listeners;
    private refreshPromise;
    constructor(options: ProtoDBClientOptions);
    private get basePath();
    /** Subscribe to session changes. Returns an unsubscribe function. */
    onAuthStateChange(callback: Listener): {
        unsubscribe: () => void;
    };
    private notify;
    private readSession;
    private writeSession;
    private readPending;
    /**
     * Start Google sign-in: builds PKCE + state, stores the verifier, and
     * redirects the browser to ProtoDB (which forwards to Google).
     * Returns the ProtoDB authorize URL (handy for tests/custom flows).
     */
    signInWithGoogle(options?: SignInOptions): Promise<{
        url: string;
    }>;
    /**
     * Finish Google sign-in on the app's redirect page: validates state,
     * exchanges code + verifier for tokens, persists the session.
     */
    handleCallback(options?: HandleCallbackOptions): Promise<{
        session: AuthSession;
        user: AuthUser;
    }>;
    /** Current session, refreshing an expiring access token when possible. */
    getSession(): Promise<AuthSession | null>;
    /** Current user, refreshed from the server when a session exists. */
    getUser(): Promise<AuthUser | null>;
    /** Rotate the refresh token pair. Invalid grants clear local state. */
    refreshSession(): Promise<AuthSession>;
    /** Revoke server-side (best-effort) and always clear local state. */
    signOut(options?: SignOutOptions): Promise<void>;
    private sessionFromTokenResponse;
    private postJson;
    private cleanupUrl;
}
/** Create a ProtoDB Auth client for one project. No secrets involved — ever. */
export declare function createProtoDBClient(options: ProtoDBClientOptions): {
    auth: ProtoDBAuthClient;
};
export {};
