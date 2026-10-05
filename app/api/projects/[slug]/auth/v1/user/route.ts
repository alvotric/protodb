import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { resolveProjectBySlug } from "@/lib/project-auth/projects";
import { validateProjectSlug } from "@/lib/project-auth/scope";
import { authenticateProjectRequest } from "@/lib/project-auth/sessions";
import { bearerTokenFromHeader } from "@/lib/project-auth/tokens";

export const runtime = "nodejs";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "invalid_token", error_description: "Access token is invalid or expired." }, { status: 401 });
}

/** Returns the calling project end-user. Bearer access token, project-scoped. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "temporarily_unavailable", error_description: "Authentication service is unavailable." }, { status: 503 });
  }
  let projectSlug: string;
  try {
    projectSlug = validateProjectSlug((await params).slug);
  } catch {
    return unauthorized();
  }
  const project = await resolveProjectBySlug(projectSlug).catch(() => null);
  if (!project) return unauthorized();
  const token = bearerTokenFromHeader(req.headers.get("authorization"));
  if (!token) return unauthorized();
  const context = await authenticateProjectRequest(project.id, token).catch(() => null);
  if (!context) return unauthorized();
  return NextResponse.json({
    user: {
      id: context.user.id,
      email: context.user.email,
      email_verified: context.user.emailVerified,
      name: context.user.name,
    },
  });
}
