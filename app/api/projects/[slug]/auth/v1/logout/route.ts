import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { resolveProjectBySlug } from "@/lib/project-auth/projects";
import { validateProjectSlug } from "@/lib/project-auth/scope";
import {
  authenticateProjectRequest,
  revokeProjectSession,
  revokeProjectSessionFamily,
} from "@/lib/project-auth/sessions";
import { bearerTokenFromHeader } from "@/lib/project-auth/tokens";

export const runtime = "nodejs";

/**
 * Project sign-out. `{"scope":"local"}` (default) revokes this session;
 * `{"scope":"global"}` revokes the whole session family (all devices).
 * Always succeeds from the caller's perspective to avoid token oracles.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }
  try {
    const projectSlug = validateProjectSlug((await params).slug);
    const project = await resolveProjectBySlug(projectSlug).catch(() => null);
    if (!project) return NextResponse.json({ ok: true });
    const token = bearerTokenFromHeader(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ ok: true });
    const context = await authenticateProjectRequest(project.id, token).catch(() => null);
    if (!context) return NextResponse.json({ ok: true });
    let scope: unknown = "local";
    try {
      const body: unknown = await req.json();
      if (body && typeof body === "object" && "scope" in body) {
        scope = (body as { scope?: unknown }).scope;
      }
    } catch {
      scope = "local";
    }
    if (scope === "global") {
      await revokeProjectSessionFamily(project.id, context.session.familyId).catch(() => undefined);
    } else {
      await revokeProjectSession(project.id, context.session.id).catch(() => undefined);
    }
  } catch {
    // Best-effort: sign-out must never fail visibly on server trouble.
  }
  return NextResponse.json({ ok: true });
}
