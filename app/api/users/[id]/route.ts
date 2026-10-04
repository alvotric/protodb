import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import {
  canChangeMember,
  isUsersAdmin,
  parseUserAdminChange,
  UserAdminValidationError,
} from "@/lib/users/user-admin-policy";
import { changeAdminUser } from "@/lib/users/user-admin-service";

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "database_unavailable", message: "User management is unavailable." } },
      { status: 503 }
    );
  }

  let actor;
  try {
    actor = await getCurrentUser();
  } catch (error) {
    console.error("Failed to resolve user-management actor:", error);
    return NextResponse.json(
      { ok: false, error: { code: "users_unavailable", message: "User management is temporarily unavailable." } },
      { status: 503 }
    );
  }
  if (!actor) {
    return NextResponse.json({ ok: false, error: { code: "unauthenticated", message: "Not signed in." } }, { status: 401 });
  }
  if (!isUsersAdmin(actor.role)) {
    return NextResponse.json({ ok: false, error: { code: "forbidden", message: "Owner access is required." } }, { status: 403 });
  }

  const { id } = await params;
  if (!USER_ID_PATTERN.test(id)) {
    return NextResponse.json({ ok: false, error: { code: "invalid_user_id", message: "User ID is invalid." } }, { status: 400 });
  }
  if (!canChangeMember(actor.id, id)) {
    return NextResponse.json({ ok: false, error: { code: "self_change_denied", message: "You cannot change your own account here." } }, { status: 400 });
  }

  let change;
  try {
    const raw = await request.text();
    if (raw.length > 4_096) throw new UserAdminValidationError("Request body is too large.");
    change = parseUserAdminChange(JSON.parse(raw));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_request", message: error instanceof Error ? error.message : "Invalid request." } },
      { status: 400 }
    );
  }

  try {
    await changeAdminUser(actor, id, change);
    await logAuditEvent({
      actor: actor.email,
      action: change.role ? "users.role.update" : "users.status.update",
      resource: `user:${id}`,
      result: "success",
      ip: request.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "user_not_found") {
      await logAuditEvent({
        actor: actor.email,
        action: change.role ? "users.role.update" : "users.status.update",
        resource: `user:${id}`,
        result: "failed",
        ip: request.headers.get("x-forwarded-for") ?? "—",
      });
      return NextResponse.json({ ok: false, error: { code: "user_not_found", message: "User was not found." } }, { status: 404 });
    }
    if (error instanceof Error && error.message === "final_owner_invariant") {
      await logAuditEvent({
        actor: actor.email,
        action: change.role ? "users.role.update" : "users.status.update",
        resource: `user:${id}`,
        result: "failed",
        ip: request.headers.get("x-forwarded-for") ?? "—",
      });
      return NextResponse.json(
        { ok: false, error: { code: "final_owner_invariant", message: "At least one active Owner must remain." } },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "self_change_denied") {
      await logAuditEvent({
        actor: actor.email,
        action: change.role ? "users.role.update" : "users.status.update",
        resource: `user:${id}`,
        result: "failed",
        ip: request.headers.get("x-forwarded-for") ?? "—",
      });
      return NextResponse.json({ ok: false, error: { code: "self_change_denied", message: "You cannot change your own account here." } }, { status: 400 });
    }
    console.error("Failed to update a user account:", error);
    await logAuditEvent({
      actor: actor.email,
      action: change.role ? "users.role.update" : "users.status.update",
      resource: `user:${id}`,
      result: "failed",
      ip: request.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json(
      { ok: false, error: { code: "user_update_failed", message: "User account could not be updated." } },
      { status: 503 }
    );
  }
}
