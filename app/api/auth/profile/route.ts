import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ ok: false, error: "Name can't be empty." }, { status: 400 });

  await query(`update protodb_admin.users set name = $1 where id = $2`, [name, user.id]);
  return NextResponse.json({ ok: true });
}
