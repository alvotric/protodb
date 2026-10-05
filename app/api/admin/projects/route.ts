import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { isUsersAdmin } from "@/lib/users/user-admin-policy";
import { logAuditEvent } from "@/lib/audit/log";
import { createProject, listProjects } from "@/lib/project-auth/projects";
import { ProjectAuthError } from "@/lib/project-auth/scope";

async function requireOwner(): Promise<{ actor: SessionUser } | { error: NextResponse }> {
  const actor = await getCurrentUser().catch(() => null);
  if (!actor) {
    return { error: NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 }) };
  }
  if (!isUsersAdmin(actor.role)) {
    return { error: NextResponse.json({ ok: false, error: "Owner access is required." }, { status: 403 }) };
  }
  return { actor };
}

/** Owner-only project registry. End-user auth never touches these routes. */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  try {
    const projects = await listProjects();
    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    console.error("Failed to list auth projects:", error);
    return NextResponse.json({ ok: false, error: "Projects could not be loaded." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new Error("invalid");
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 }
    );
  }
  const record = body as Record<string, unknown>;
  const slugForAudit = typeof record.slug === "string" ? record.slug : "unknown";
  try {
    const project = await createProject({
      slug: record.slug,
      name: record.name,
      createdBy: auth.actor.id,
    });
    await logAuditEvent({
      actor: auth.actor.email,
      action: "project.create",
      resource: `project:${project.slug}`,
      result: "success",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    console.error("Failed to create auth project:", error);
    await logAuditEvent({
      actor: auth.actor.email,
      action: "project.create",
      resource: `project:${slugForAudit}`,
      result: "failed",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    if (error instanceof ProjectAuthError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "Project could not be created." }, { status: 503 });
  }
}
