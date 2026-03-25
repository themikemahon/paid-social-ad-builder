import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — return all saved edits as { [ad_id]: { [field_index]: html } }
export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT ad_id, field_index, html FROM ad_edits`;
    const edits: Record<string, Record<number, string>> = {};
    for (const row of rows) {
      if (!edits[row.ad_id]) edits[row.ad_id] = {};
      edits[row.ad_id][row.field_index] = row.html;
    }
    return NextResponse.json(edits);
  } catch (e) {
    console.error("GET /api/ads error:", e);
    return NextResponse.json({}, { status: 500 });
  }
}

// POST — save edits: body is { [ad_id]: { [field_index]: html } }
export async function POST(req: NextRequest) {
  try {
    const edits: Record<string, Record<string, string>> = await req.json();
    const sql = getDb();

    for (const [adId, fields] of Object.entries(edits)) {
      for (const [fieldIndex, html] of Object.entries(fields)) {
        await sql`
          INSERT INTO ad_edits (ad_id, field_index, html)
          VALUES (${adId}, ${Number(fieldIndex)}, ${html})
          ON CONFLICT (ad_id, field_index)
          DO UPDATE SET html = ${html}, updated_at = NOW()
        `;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/ads error:", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
