import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS ad_comments (
      id SERIAL PRIMARY KEY,
      ad_id TEXT NOT NULL,
      author TEXT NOT NULL,
      message TEXT NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

// GET — return all comments grouped by ad_id
export async function GET() {
  try {
    const sql = getDb();
    await ensureTable();
    const rows = await sql`SELECT id, ad_id, author, message, resolved, created_at FROM ad_comments ORDER BY created_at ASC`;
    const result: Record<string, Array<{id: number; author: string; message: string; resolved: boolean; created_at: string}>> = {};
    for (const row of rows) {
      if (!result[row.ad_id]) result[row.ad_id] = [];
      result[row.ad_id].push({ id: row.id, author: row.author, message: row.message, resolved: row.resolved, created_at: row.created_at });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/comments error:", e);
    return NextResponse.json({}, { status: 500 });
  }
}

// POST — add comment: { ad_id, author, message }
export async function POST(req: NextRequest) {
  try {
    const { ad_id, author, message } = await req.json();
    if (!ad_id || !author || !message) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const sql = getDb();
    await ensureTable();
    const rows = await sql`
      INSERT INTO ad_comments (ad_id, author, message)
      VALUES (${ad_id}, ${author}, ${message})
      RETURNING id, created_at
    `;
    return NextResponse.json({ id: rows[0].id, created_at: rows[0].created_at });
  } catch (e) {
    console.error("POST /api/comments error:", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// PATCH — resolve or edit comment: { id, resolved?, message? }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const sql = getDb();
    await ensureTable();
    if (body.message !== undefined) {
      await sql`UPDATE ad_comments SET message = ${body.message} WHERE id = ${body.id}`;
    }
    if (body.resolved !== undefined) {
      await sql`UPDATE ad_comments SET resolved = ${body.resolved} WHERE id = ${body.id}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/comments error:", e);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// DELETE — delete comment: { id }
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const sql = getDb();
    await ensureTable();
    await sql`DELETE FROM ad_comments WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/comments error:", e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
