import { createHash } from "node:crypto";
import { ProjectAuthError } from "./scope.ts";

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

/**
 * PKCE (RFC 7636) helpers. The browser/app generates `verifier`, sends
 * only `challenge = BASE64URL(SHA256(verifier))` at authorize time, and
 * proves possession at token time. The server never sees the verifier
 * until redemption, so a leaked authorization code alone is useless.
 */
export function validateCodeChallenge(value: unknown): string {
  if (typeof value !== "string" || !VERIFIER_PATTERN.test(value)) {
    throw new ProjectAuthError("code_challenge must be a 43–128 character base64url string (PKCE S256).");
  }
  return value;
}

export function validateCodeVerifier(value: unknown): string {
  if (typeof value !== "string" || !VERIFIER_PATTERN.test(value)) {
    throw new ProjectAuthError("code_verifier is invalid.");
  }
  return value;
}

export function pkceChallengeForVerifier(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function verifyPkceChallenge(verifier: string, challenge: string): boolean {
  return pkceChallengeForVerifier(verifier) === challenge;
}
