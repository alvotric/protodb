import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, queryOne } from "@/lib/db/client";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { isUsersAdmin } from "@/lib/users/user-admin-policy";
import { logAuditEvent } from "@/lib/audit/log";
import { resolveProjectById, updateProjectName } from "@/lib/project-auth/projects";
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const project = await resolveProjectById(id).catch(() => null);
  if (!project) return NextResponse.json({ ok: false, error: "Project was not found." }, { status: 404 });
  const provider = await queryOne<{ client_id: string; enabled: boolean }>(
    `select client_id, enabled from protodb_admin.project_auth_providers
     where project_id = $1 and provider = 'google'`,
    [id]
  ).catch(() => null);
  return NextResponse.json({
    ok: true,
    project,
    google: provider
      ? { configured: true, enabled: provider.enabled, client_id: provider.client_id }
      : { configured: false, enabled: false, client_id: null },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const project = await resolveProjectById(id).catch(() => null);
  if (!project) return NextResponse.json({ ok: false, error: "Project was not found." }, { status: 404 });
  let name: unknown;
  try {
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new Error("invalid");
    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "name")) throw new Error("Only the name field can be updated.");
    name = record.name;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 }
    );
  }
  try {
    const updated = await updateProjectName(id, name);
    await logAuditEvent({
      actor: auth.actor.email,
      action: "project.update",
      resource: `project:${project.slug}`,
      result: "success",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json({ ok: true, project: updated });
  } catch (error) {
    console.error("Failed to update auth project:", error);
    await logAuditEvent({
      actor: auth.actor.email,
      action: "project.update",
      resource: `project:${project.slug}`,
      result: "failed",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    if (error instanceof ProjectAuthError) {
      const status = error.status === 404 ? 404 : 400;
      return NextResponse.json({ ok: false, error: error.message }, { status });
    }
    return NextResponse.json({ ok: false, error: "Project could not be updated." }, { status: 503 });
  }
}
