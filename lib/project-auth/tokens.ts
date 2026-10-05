import { createHash, randomBytes } from "node:crypto";

/** Authorization codes: single-use, 10 minutes. */
export const PROJECT_AUTH_CODE_TTL_SECONDS = 600;
/** Access tokens: short-lived bearer credentials, 1 hour. */
export const PROJECT_ACCESS_TOKEN_TTL_SECONDS = 3600;
/** Refresh tokens: rotating, 30 days. */
export const PROJECT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Opaque 256-bit bearer tokens. Only SHA-256 hashes persist (same
 * principle as admin sessions in lib/auth/session.ts); a database dump
 * alone cannot be replayed.
 */
export function generateProjectToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashProjectToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function bearerTokenFromHeader(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^Bearer ([0-9a-f]{64})$/i.exec(value.trim());
  return match ? match[1] : null;
}
