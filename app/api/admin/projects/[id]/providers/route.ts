import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, query, queryOne } from "@/lib/db/client";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { isUsersAdmin } from "@/lib/users/user-admin-policy";
import { logAuditEvent } from "@/lib/audit/log";
import { ProjectAuthError } from "@/lib/project-auth/scope";
import { resolveProjectById, setProjectGoogleProvider } from "@/lib/project-auth/projects";
import {
  validateGoogleClientId,
  validateRedirectUrlList,
} from "@/lib/project-auth/providers";

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

/** Provider metadata for owners. The client secret is write-only and never returned. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const project = await resolveProjectById(id).catch(() => null);
  if (!project) return NextResponse.json({ ok: false, error: "Project was not found." }, { status: 404 });
  const provider = await queryOne<{
    client_id: string;
    enabled: boolean;
    allowed_redirect_urls: string[];
    updated_at: Date | string;
  }>(
    `select client_id, enabled, allowed_redirect_urls, updated_at
     from protodb_admin.project_auth_providers
     where project_id = $1 and provider = 'google'`,
    [id]
  ).catch(() => null);
  return NextResponse.json({
    ok: true,
    project: { id: project.id, slug: project.slug },
    google: provider
      ? {
          configured: true,
          enabled: provider.enabled,
          client_id: provider.client_id,
          allowed_redirect_urls: provider.allowed_redirect_urls,
          updated_at: provider.updated_at,
        }
      : { configured: false, enabled: false, client_id: null, allowed_redirect_urls: [] },
  });
}

/**
 * Configures (or rotates) the project's Google provider. The secret is
 * encrypted at rest immediately and never returned, logged, or audited.
 * Omitting clientSecret keeps the existing secret; disabling keeps the
 * stored secret for later re-enable.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const project = await resolveProjectById(id).catch(() => null);
  if (!project) return NextResponse.json({ ok: false, error: "Project was not found." }, { status: 404 });

  let clientId: string;
  let redirectUrls: string[];
  let enabled: boolean;
  let clientSecret: string | null;
  try {
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new Error("Request body must be a JSON object.");
    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["clientId", "clientSecret", "redirectUrls", "enabled"].includes(key))) {
      throw new Error("Only clientId, clientSecret, redirectUrls, and enabled fields are accepted.");
    }
    clientId = validateGoogleClientId(record.clientId);
    redirectUrls = validateRedirectUrlList(record.redirectUrls);
    if (typeof record.enabled !== "boolean") throw new Error("enabled must be a boolean.");
    enabled = record.enabled;
    clientSecret = record.clientSecret === undefined || record.clientSecret === null
      ? null
      : String(record.clientSecret);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const existing = await queryOne<{ client_secret_enc: unknown }>(
      `select client_secret_enc from protodb_admin.project_auth_providers
       where project_id = $1 and provider = 'google'`,
      [id]
    ).catch(() => null);
    if (clientSecret === null) {
      if (!existing) {
        return NextResponse.json({ ok: false, error: "A client secret is required on first setup." }, { status: 400 });
      }
      // Secret rotation skipped: re-encrypt is unnecessary when unchanged.
      await query(
        `update protodb_admin.project_auth_providers
         set enabled = $2, client_id = $3, allowed_redirect_urls = $4, updated_at = now()
         where project_id = $1 and provider = 'google'`,
        [id, enabled, clientId, redirectUrls]
      );
    } else {
      await setProjectGoogleProvider({
        projectId: id,
        clientId,
        clientSecret,
        redirectUrls,
        enabled,
      });
    }
    await logAuditEvent({
      actor: auth.actor.email,
      action: "project.provider.update",
      resource: `project:${project.slug}`,
      result: "success",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json({
      ok: true,
      google: { configured: true, enabled, client_id: clientId, allowed_redirect_urls: redirectUrls },
    });
  } catch (error) {
    console.error("Failed to save project Google provider:", error instanceof Error ? error.message : error);
    await logAuditEvent({
      actor: auth.actor.email,
      action: "project.provider.update",
      resource: `project:${project.slug}`,
      result: "failed",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    if (error instanceof ProjectAuthError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "Google provider could not be saved." }, { status: 503 });
  }
}
