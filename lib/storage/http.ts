import { NextResponse } from "next/server";
import { StorageRequestError } from "@/lib/storage/policy";
import { StorageServiceError } from "@/lib/storage/service";

export async function readStorageJson(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes) throw new StorageRequestError("Request body is too large.", 413);
  if (!request.body) throw new StorageRequestError("A JSON request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new StorageRequestError("Request body is too large.", 413);
    }
    chunks.push(value);
  }

  let parsed: unknown;
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new StorageRequestError("Request body must contain valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new StorageRequestError("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function rejectUnknownFields(body: Record<string, unknown>, allowed: string[]): void {
  const unexpected = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    throw new StorageRequestError(`Unexpected request field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`);
  }
}

export function storageErrorResponse(error: unknown, fallback = "Storage operation failed.") {
  if (error instanceof StorageRequestError || error instanceof StorageServiceError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
  if (code === "23505") return NextResponse.json({ ok: false, error: "A conflicting Storage item already exists." }, { status: 409 });
  if (code === "42P01" || code === "3F000") {
    return NextResponse.json({ ok: false, error: "Storage metadata is not initialized. Apply migrations/003_storage_metadata.sql." }, { status: 503 });
  }
  console.error(fallback, error);
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}

export function notConfiguredResponse() {
  return NextResponse.json({ ok: false, error: "Storage provider or database is not configured." }, { status: 503 });
}
