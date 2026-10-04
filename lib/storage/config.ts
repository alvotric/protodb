export interface StorageConfiguration {
  provider: "s3";
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

/**
 * Provider-agnostic S3-compatible configuration. The same fields cover
 * every supported backend — only the endpoint/region/auth combination
 * changes per provider:
 * - AWS S3: region + bucket, no endpoint (IAM role preferred; static
 *   keys only when the server has no instance role).
 * - Cloudflare R2: S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com,
 *   S3_REGION=auto, R2 API token as key pair, path style on.
 * - Backblaze B2 (S3-compatible): S3_ENDPOINT=https://s3.<region>.backblazeb2.com,
 *   B2 application key as key pair, path style on.
 * - Local emulator (development only): loopback HTTP endpoint such as
 *   http://127.0.0.1:9000 with emulator credentials. Remote plain-HTTP
 *   endpoints are rejected by validEndpoint() below.
 * Variable names are stable API — do not rename them per provider.
 */
export type StorageConfigurationStatus =
  | { mode: "demo" }
  | { mode: "unavailable"; error: string }
  | { mode: "live"; configuration: StorageConfiguration };

function validEndpoint(value: string): boolean {
  try {
    const endpoint = new URL(value);
    if (!["http:", "https:"].includes(endpoint.protocol) ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      return false;
    }
    if (endpoint.protocol === "https:") return true;
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(endpoint.hostname);
  } catch {
    return false;
  }
}

export function getStorageConfigurationStatus(): StorageConfigurationStatus {
  const providerValue = process.env.STORAGE_PROVIDER;
  const configured = Boolean(
    providerValue ||
    process.env.S3_BUCKET ||
    process.env.S3_REGION ||
    process.env.S3_ENDPOINT ||
    process.env.S3_ACCESS_KEY_ID ||
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.S3_FORCE_PATH_STYLE
  );
  if (!configured) return { mode: "demo" };
  if (providerValue !== "s3") {
    return { mode: "unavailable", error: "STORAGE_PROVIDER must be set to s3." };
  }

  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || undefined;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || undefined;
  if (!bucket || !region) {
    return { mode: "unavailable", error: "S3_BUCKET and S3_REGION are required for live storage." };
  }
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    return { mode: "unavailable", error: "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together." };
  }
  if (endpoint && !accessKeyId) {
    return { mode: "unavailable", error: "S3-compatible custom endpoints require access key credentials." };
  }
  if (endpoint && !validEndpoint(endpoint)) {
    return { mode: "unavailable", error: "S3_ENDPOINT must use HTTPS, except for a loopback HTTP endpoint used for local development, and must not contain credentials, query, or fragment values." };
  }

  const forcePathStyleValue = process.env.S3_FORCE_PATH_STYLE;
  if (forcePathStyleValue && forcePathStyleValue !== "true" && forcePathStyleValue !== "false") {
    return { mode: "unavailable", error: "S3_FORCE_PATH_STYLE must be true or false." };
  }

  return {
    mode: "live",
    configuration: {
      provider: "s3",
      bucket,
      region,
      ...(endpoint ? { endpoint } : {}),
      ...(accessKeyId ? { accessKeyId } : {}),
      ...(secretAccessKey ? { secretAccessKey } : {}),
      forcePathStyle: endpoint ? forcePathStyleValue !== "false" : forcePathStyleValue === "true",
    },
  };
}

export function isStorageConfigured(): boolean {
  return getStorageConfigurationStatus().mode === "live";
}
