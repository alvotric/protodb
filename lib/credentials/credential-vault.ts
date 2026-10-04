import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  hkdfSync,
} from "node:crypto";
// NOTE: server-only by convention (same as other lib/* server modules).
// The `server-only` package is not a dependency in this repo, so no
// `import "server-only"` barrier is added here; never import this module
// from client components. Decryption occurs strictly server-side
// immediately before connection establishment.

/**
 * Phase 10 — Credential Architecture & Authenticated Encryption.
 *
 * Architecture definition:
 * - Scope: Single configured target workspace ("default"). True multi-tenant
 *   per-workspace credential vaults are deferred until multi-workspace
 *   tenancy is introduced in a future phase.
 * - Cipher: AES-256-GCM (Galois/Counter Mode) authenticated encryption.
 * - Nonce: 12-byte cryptographically secure random IV generated per encryption.
 * - Auth Tag: 16-byte GCM authentication tag verifying ciphertext integrity.
 * - Additional Authenticated Data (AAD): Binds encryption to key version,
 *   workspace scope, and credential type, preventing replay across scopes.
 * - Key derivation: Master key loaded from CREDENTIAL_ENCRYPTION_KEY (hex/base64
 *   or 32-byte raw). Subkeys derived via HKDF-SHA256 with domain separation.
 * - Decryption boundary: Decryption occurs strictly server-side immediately
 *   before connection establishment. Plaintext credentials NEVER reach browser
 *   code, API response JSON, or audit logs.
 */

export const CREDENTIAL_SCOPE = "workspace:default" as const;
export const CURRENT_KEY_VERSION = "v1" as const;

export type CredentialType = "database" | "database_ddl" | "s3_access_key" | "s3_secret_key";

export interface EncryptedCredentialEnvelope {
  version: typeof CURRENT_KEY_VERSION;
  scope: typeof CREDENTIAL_SCOPE;
  type: CredentialType;
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
  createdAt: string;
}

export class CredentialVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialVaultError";
  }
}

/**
 * Derives a 32-byte AES-256 key for a specific credential type using HKDF.
 */
export function deriveKeyForType(masterKeyRaw: string | Buffer, type: CredentialType): Buffer {
  let masterBuffer: Buffer;
  if (typeof masterKeyRaw === "string") {
    const trimmed = masterKeyRaw.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      masterBuffer = Buffer.from(trimmed, "hex");
    } else if (/^[A-Za-z0-9+/=]{44}$/.test(trimmed)) {
      masterBuffer = Buffer.from(trimmed, "base64");
    } else {
      masterBuffer = Buffer.from(trimmed, "utf8");
    }
  } else {
    masterBuffer = masterKeyRaw;
  }

  if (masterBuffer.length < 16) {
    throw new CredentialVaultError("Master encryption key must provide at least 128 bits of entropy (32 hex characters or 16 bytes).");
  }

  const salt = Buffer.from("protodb-admin-vault-salt-v1", "utf8");
  const info = Buffer.from(`protodb-credential:${type}:${CREDENTIAL_SCOPE}`, "utf8");
  const derived = hkdfSync("sha256", masterBuffer, salt, info, 32);
  return Buffer.from(derived);
}

function resolveMasterKey(overrideKey?: string): string {
  const key = overrideKey ?? process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key || key.trim().length === 0) {
    throw new CredentialVaultError(
      "CREDENTIAL_ENCRYPTION_KEY is not configured. Credential vault operations are disabled."
    );
  }
  return key;
}

function buildAad(version: string, scope: string, type: CredentialType): Buffer {
  return Buffer.from(`${version}:${scope}:${type}`, "utf8");
}

/**
 * Encrypts a plaintext secret using AES-256-GCM with scope-bound AAD.
 */
export function encryptCredential(
  plaintext: string,
  type: CredentialType,
  masterKey?: string
): EncryptedCredentialEnvelope {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new CredentialVaultError("Plaintext secret to encrypt cannot be empty.");
  }

  const key = deriveKeyForType(resolveMasterKey(masterKey), type);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const aad = buildAad(CURRENT_KEY_VERSION, CREDENTIAL_SCOPE, type);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    version: CURRENT_KEY_VERSION,
    scope: CREDENTIAL_SCOPE,
    type,
    ivHex: iv.toString("hex"),
    authTagHex: authTag.toString("hex"),
    ciphertextHex: ciphertext.toString("hex"),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Decrypts a previously encrypted credential envelope.
 * Strictly server-side only. Throws if authentication tag or AAD does not match.
 */
export function decryptCredential(
  envelope: EncryptedCredentialEnvelope,
  masterKey?: string
): string {
  if (!envelope || typeof envelope !== "object") {
    throw new CredentialVaultError("Invalid credential envelope.");
  }
  if (envelope.version !== CURRENT_KEY_VERSION) {
    throw new CredentialVaultError(`Unsupported credential envelope version: ${envelope.version}`);
  }
  if (envelope.scope !== CREDENTIAL_SCOPE) {
    throw new CredentialVaultError(`Envelope scope mismatch: ${envelope.scope}`);
  }

  const key = deriveKeyForType(resolveMasterKey(masterKey), envelope.type);
  const iv = Buffer.from(envelope.ivHex, "hex");
  const authTag = Buffer.from(envelope.authTagHex, "hex");
  const ciphertext = Buffer.from(envelope.ciphertextHex, "hex");

  if (iv.length !== 12 || authTag.length !== 16) {
    throw new CredentialVaultError("Malformed IV or authentication tag in credential envelope.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    const aad = buildAad(envelope.version, envelope.scope, envelope.type);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new CredentialVaultError("Credential decryption failed: ciphertext was altered or invalid key was supplied.");
  }
}

/**
 * Masking utility for safe UI/logging display.
 * Never outputs unmasked secrets.
 */
export function maskSecret(secret: string): string {
  if (!secret) return "—";
  if (secret.length <= 4) return "••••";
  if (secret.length <= 8) return `${secret.slice(0, 2)}••••${secret.slice(-2)}`;
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

/**
 * Masks a database connection URL, hiding the password component while
 * preserving host, port, user, and database name.
 */
export function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "********";
    }
    return parsed.toString();
  } catch {
    return "postgres://****:********@****/********";
  }
}
