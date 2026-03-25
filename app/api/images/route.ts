import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS ad_images (
      ad_id TEXT PRIMARY KEY,
      blob_url TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

// GET — return all images as { [ad_id]: blob_url }
export async function GET() {
  try {
    const sql = getDb();
    await ensureTable();
    const rows = await sql`SELECT ad_id, blob_url FROM ad_images`;
    const result: Record<string, string> = {};
    for (const row of rows) result[row.ad_id] = row.blob_url;
    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/images error:", e);
    return NextResponse.json({}, { status: 500 });
  }
}

// POST — upload image. Expects FormData with "file" and "ad_id"
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const adId = formData.get("ad_id") as string;
    if (!file || !adId) {
      return NextResponse.json({ error: "Missing file or ad_id" }, { status: 400 });
    }

    const sql = getDb();
    await ensureTable();

    // Delete old blob if exists
    const existing = await sql`SELECT blob_url FROM ad_images WHERE ad_id = ${adId}`;
    if (existing.length > 0) {
      try { await del(existing[0].blob_url); } catch (_) {}
    }

    // Upload to Vercel Blob
    const blob = await put(`ad-images/${adId}-${Date.now()}.png`, file, {
      access: "public",
    });

    // Save URL to DB
    await sql`
      INSERT INTO ad_images (ad_id, blob_url)
      VALUES (${adId}, ${blob.url})
      ON CONFLICT (ad_id)
      DO UPDATE SET blob_url = ${blob.url}, updated_at = NOW()
    `;

    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error("POST /api/images error:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// DELETE — remove image. Expects JSON { ad_id }
export async function DELETE(req: NextRequest) {
  try {
    const { ad_id } = await req.json();
    const sql = getDb();
    await ensureTable();

    const existing = await sql`SELECT blob_url FROM ad_images WHERE ad_id = ${ad_id}`;
    if (existing.length > 0) {
      try { await del(existing[0].blob_url); } catch (_) {}
    }
    await sql`DELETE FROM ad_images WHERE ad_id = ${ad_id}`;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/images error:", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
