import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, queryOne, withTransaction } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";
import {
  AuthInputError,
  normalizeEmail,
  parseAuthRequest,
  validateAuthName,
  validateAuthPassword,
} from "@/lib/auth/input-policy";

const BOOTSTRAP_LOCK_NAMESPACE = 734091;
const BOOTSTRAP_LOCK_ID = 1;

class SetupAlreadyCompleteError extends Error {}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ needsSetup: false, databaseConfigured: false });
  }

  try {
    const existing = await queryOne<{ count: string }>(
      `select count(*)::text as count from protodb_admin.users`
    );
    return NextResponse.json({
      needsSetup: existing?.count === "0",
      databaseConfigured: true,
    });
  } catch (error) {
    console.error("Failed to read first-run setup status:", error);
    return NextResponse.json(
      {
        needsSetup: false,
        databaseConfigured: true,
        error: "Account setup status is temporarily unavailable.",
      },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Account setup is unavailable." }, { status: 503 });
  }

  let email: string;
  let name: string;
  let password: string;
  try {
    const body = await parseAuthRequest(req);
    if (Object.keys(body).some((key) => !["email", "password", "name"].includes(key))) {
      throw new AuthInputError("Only name, email, and password fields are accepted.");
    }
    email = normalizeEmail(body.email);
    name = validateAuthName(body.name);
    password = validateAuthPassword(body.password);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await hashPassword(password);
    const created = await withTransaction(async (client) => {
      await client.query("select pg_advisory_xact_lock($1, $2)", [
        BOOTSTRAP_LOCK_NAMESPACE,
        BOOTSTRAP_LOCK_ID,
      ]);
      const result = await client.query<{ count: string }>(
        `select count(*)::text as count from protodb_admin.users`
      );
      if (result.rows[0]?.count !== "0") throw new SetupAlreadyCompleteError();

      const inserted = await client.query<{ id: string }>(
        `insert into protodb_admin.users (email, password_hash, name, role, status)
         values ($1, $2, $3, 'Owner', 'active')
         returning id`,
        [email, passwordHash, name]
      );
      if (!inserted.rows[0]) throw new Error("Owner insert returned no row.");
      return inserted.rows[0];
    });

    try {
      await createSession(created.id);
    } catch (error) {
      console.error("First Owner was created but its session could not be started:", error);
      return NextResponse.json(
        { ok: false, error: "The Owner account was created. Sign in to continue." },
        { status: 503 }
      );
    }

    await logAuditEvent({
      actor: email,
      action: "auth.setup",
      resource: "workspace",
      result: "success",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SetupAlreadyCompleteError) {
      return NextResponse.json({ ok: false, error: "Setup has already been completed." }, { status: 409 });
    }
    console.error("Failed to create the first Owner account:", error);
    return NextResponse.json(
      { ok: false, error: "Account setup could not be completed. Please try again." },
      { status: 503 }
    );
  }
}
