import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { isUsersAdmin } from "@/lib/users/user-admin-policy";
import { resolveProjectById } from "@/lib/project-auth/projects";
import { listProjectUsers } from "@/lib/project-auth/users";

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

/** Owner-only roster of a project's end users. Separate from admin users. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const project = await resolveProjectById(id).catch(() => null);
  if (!project) return NextResponse.json({ ok: false, error: "Project was not found." }, { status: 404 });
  try {
    const users = await listProjectUsers(id);
    return NextResponse.json({ ok: true, project: { id: project.id, slug: project.slug }, users });
  } catch (error) {
    console.error("Failed to list project users:", error);
    return NextResponse.json({ ok: false, error: "Project users could not be loaded." }, { status: 503 });
  }
}
