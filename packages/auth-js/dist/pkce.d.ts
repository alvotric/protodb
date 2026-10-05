/** 64 random bytes → base64url (valid PKCE verifier, 86 chars). */
export declare function generateVerifier(): Promise<string>;
/** S256 challenge for a verifier. Matches the server's verifyPkceChallenge. */
export declare function challengeForVerifier(verifier: string): Promise<string>;
/** 16 random bytes as hex — CSRF state for the round-trip. */
export declare function generateState(): string;
