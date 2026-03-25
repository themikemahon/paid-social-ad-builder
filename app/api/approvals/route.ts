import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS ad_approvals (
      ad_id TEXT PRIMARY KEY,
      approved BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

// GET — return all approvals as { [ad_id]: true }
export async function GET() {
  try {
    const sql = getDb();
    await ensureTable();
    const rows = await sql`SELECT ad_id FROM ad_approvals WHERE approved = true`;
    const result: Record<string, boolean> = {};
    for (const row of rows) result[row.ad_id] = true;
    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/approvals error:", e);
    return NextResponse.json({}, { status: 500 });
  }
}

// POST — body: { ad_id: string, approved: boolean }
export async function POST(req: NextRequest) {
  try {
    const { ad_id, approved } = await req.json();
    const sql = getDb();
    await ensureTable();
    await sql`
      INSERT INTO ad_approvals (ad_id, approved)
      VALUES (${ad_id}, ${approved})
      ON CONFLICT (ad_id)
      DO UPDATE SET approved = ${approved}, updated_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/approvals error:", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
