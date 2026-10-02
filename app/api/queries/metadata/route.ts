import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured, query } from "@/lib/db/client";

interface MetadataRow {
  table_schema: string;
  table_name: string;
  column_name: string;
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  try {
    const rows = await query<MetadataRow>(
      `select table_schema, table_name, column_name
       from information_schema.columns
       where table_schema not in ('pg_catalog', 'information_schema', 'protodb_admin')
         and table_schema not like 'pg\\_toast%'
       order by table_schema, table_name, ordinal_position
       limit 5001`
    );
    const identifiers = new Set<string>();
    for (const row of rows.slice(0, 5000)) {
      identifiers.add(`"${row.table_schema.replace(/"/g, '""')}"."${row.table_name.replace(/"/g, '""')}"`);
      identifiers.add(`"${row.column_name.replace(/"/g, '""')}"`);
    }
    return NextResponse.json({ ok: true, identifiers: [...identifiers].sort(), truncated: rows.length > 5000 });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load accessible schema metadata." }, { status: 500 });
  }
}
