export const MAX_EMAIL_LENGTH = 254;
export const MAX_NAME_LENGTH = 100;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export class AuthInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthInputError";
  }
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new AuthInputError("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new AuthInputError("Enter a valid email address.");
  }
  return email;
}

export function validateAuthName(value: unknown): string {
  if (typeof value !== "string") throw new AuthInputError("Enter a name.");
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new AuthInputError(`Name must be between 1 and ${MAX_NAME_LENGTH} characters.`);
  }
  return name;
}

export function validateAuthPassword(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < MIN_PASSWORD_LENGTH ||
    value.length > MAX_PASSWORD_LENGTH
  ) {
    throw new AuthInputError(
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`
    );
  }
  return value;
}

export function readAuthObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthInputError("Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function parseAuthJson(text: string): Record<string, unknown> {
  try {
    return readAuthObject(JSON.parse(text));
  } catch (error) {
    if (error instanceof AuthInputError) throw error;
    throw new AuthInputError("Request body must be valid JSON.");
  }
}

export async function parseAuthRequest(
  request: Request,
  maximumBytes = 8_192
): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maximumBytes) {
    throw new AuthInputError("Request body is too large.");
  }
  if (!request.body) throw new AuthInputError("Request body must be valid JSON.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new AuthInputError("Request body is too large.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AuthInputError) throw error;
    throw new AuthInputError("Request body must be valid JSON.");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return parseAuthJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof AuthInputError) throw error;
    throw new AuthInputError("Request body must be valid JSON.");
  }
}
