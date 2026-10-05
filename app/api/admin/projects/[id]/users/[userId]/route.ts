import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { isUsersAdmin } from "@/lib/users/user-admin-policy";
import { logAuditEvent } from "@/lib/audit/log";
import { ProjectAuthError } from "@/lib/project-auth/scope";
import { resolveProjectById } from "@/lib/project-auth/projects";
import { setProjectUserStatus } from "@/lib/project-auth/users";

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

/** Owner-only suspend/reactivate of a project end user. Suspension revokes sessions immediately. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const { id, userId } = await params;
  const project = await resolveProjectById(id).catch(() => null);
  if (!project) return NextResponse.json({ ok: false, error: "Project was not found." }, { status: 404 });
  let status: "active" | "suspended";
  try {
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new Error("Request body must be a JSON object.");
    const record = body as Record<string, unknown>;
    if (record.status !== "active" && record.status !== "suspended") {
      throw new Error("status must be active or suspended.");
    }
    status = record.status;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 }
    );
  }
  try {
    const user = await setProjectUserStatus(id, userId, status);
    await logAuditEvent({
      actor: auth.actor.email,
      action: "project.user.status",
      resource: `project:${project.slug}`,
      result: "success",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("Failed to update project user status:", error);
    await logAuditEvent({
      actor: auth.actor.email,
      action: "project.user.status",
      resource: `project:${project.slug}`,
      result: "failed",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    if (error instanceof ProjectAuthError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "Project user could not be updated." }, { status: 503 });
  }
}
