import {
  CredentialVaultError,
  decryptCredential,
  type EncryptedCredentialEnvelope,
} from "../credentials/credential-vault.ts";
import { ProjectAuthError } from "./scope.ts";

export interface ProjectGoogleProvider {
  id: string;
  projectId: string;
  enabled: boolean;
  clientId: string;
  allowedRedirectUrls: string[];
}

function isLoopbackHttp(url: URL): boolean {
  return url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
}

/**
 * Redirect URLs are allowlisted per project. Exact-string match at
 * runtime; at write time only well-formed HTTPS (or loopback HTTP for
 * local development) URLs without embedded credentials or fragments
 * are accepted — same rule shape as storage endpoints.
 */
export function validateRedirectUrl(value: unknown): string {
  if (typeof value !== "string") throw new ProjectAuthError("redirect_uri must be a string.");
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ProjectAuthError("redirect_uri is not a valid URL.");
  }
  if (url.username || url.password || url.hash) {
    throw new ProjectAuthError("redirect_uri must not contain credentials or fragments.");
  }
  if (url.protocol !== "https:" && !isLoopbackHttp(url)) {
    throw new ProjectAuthError("redirect_uri must use HTTPS, except loopback HTTP for local development.");
  }
  if (trimmed.length > 2048) throw new ProjectAuthError("redirect_uri is too long.");
  return trimmed;
}

export function validateRedirectUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ProjectAuthError("allowed_redirect_urls must be an array.");
  if (value.length > 50) throw new ProjectAuthError("allowed_redirect_urls must not exceed 50 entries.");
  const seen = new Set<string>();
  return value.map((entry) => {
    const url = validateRedirectUrl(entry);
    if (seen.has(url)) throw new ProjectAuthError("allowed_redirect_urls contains a duplicate entry.");
    seen.add(url);
    return url;
  });
}

/** Exact match only — no prefix, suffix, or normalization games. */
export function matchRedirectUri(allowed: readonly string[], candidate: string): boolean {
  return allowed.includes(candidate);
}

export function validateGoogleClientId(value: unknown): string {
  if (typeof value !== "string") throw new ProjectAuthError("Google client ID must be a string.");
  const clientId = value.trim();
  if (clientId.length === 0 || clientId.length > 512) {
    throw new ProjectAuthError("Google client ID must be between 1 and 512 characters.");
  }
  return clientId;
}

/** Decrypts the project Google secret server-side, at point of use only. */
export function decryptGoogleClientSecret(envelope: EncryptedCredentialEnvelope): string {
  try {
    return decryptCredential(envelope);
  } catch (error) {
    if (error instanceof CredentialVaultError) {
      throw new ProjectAuthError("Google provider credentials are unavailable.", 503);
    }
    throw error;
  }
}
