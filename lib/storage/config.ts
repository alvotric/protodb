export interface StorageConfiguration {
  provider: "s3";
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

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
