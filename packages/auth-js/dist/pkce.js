import { ProtoDBAuthError } from "./errors.js";
function base64UrlEncode(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1)
        binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function webCrypto() {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new ProtoDBAuthError("secure-context-required", "Web Crypto is unavailable. Serve the app over HTTPS or localhost.");
    }
    return subtle;
}
/** 64 random bytes → base64url (valid PKCE verifier, 86 chars). */
export async function generateVerifier() {
    const bytes = new Uint8Array(64);
    globalThis.crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
}
/** S256 challenge for a verifier. Matches the server's verifyPkceChallenge. */
export async function challengeForVerifier(verifier) {
    const digest = await webCrypto().digest("SHA-256", new TextEncoder().encode(verifier));
    return base64UrlEncode(new Uint8Array(digest));
}
/** 16 random bytes as hex — CSRF state for the round-trip. */
export function generateState() {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
