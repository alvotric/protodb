import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { resolveProjectBySlug } from "@/lib/project-auth/projects";
import { validateProjectSlug, ProjectAuthError, type ProjectRecord } from "@/lib/project-auth/scope";

/**
 * Shared preamble for project-auth routes: database gate, slug
 * validation, project resolution. Throws ProjectAuthError (handled by
 * `authRouteError`) so routes stay focused on their own logic.
 */
export async function resolveProjectParam(params: Promise<{ slug: string }>): Promise<ProjectRecord> {
  const slug = validateProjectSlug((await params).slug);
  const project = await resolveProjectBySlug(slug).catch(() => null);
  if (!project) throw new ProjectAuthError("Project was not found.", 404);
  return project;
}

export async function readJsonBody(req: NextRequest, maxBytes = 8192): Promise<Record<string, unknown>> {
  const text = await req.text().catch(() => "");
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ProjectAuthError("Request body is too large.", 413);
  }
  try {
    const parsed: unknown = JSON.parse(text || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ProjectAuthError("Request body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProjectAuthError) throw error;
    throw new ProjectAuthError("Request body must be valid JSON.");
  }
}

/** `{ ok: false, error: <code>, message }` — `error` is stable for client UX mapping. */
export function authRouteError(error: unknown, fallback: string): NextResponse {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "temporarily_unavailable", message: "Authentication service is unavailable." }, { status: 503 });
  }
  if (error instanceof ProjectAuthError) {
    const code = error.code ?? "invalid_request";
    return NextResponse.json({ ok: false, error: code, message: error.message }, { status: error.status });
  }
  return NextResponse.json({ ok: false, error: "server_error", message: fallback }, { status: 500 });
}

export function requestIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") ?? "—";
}
