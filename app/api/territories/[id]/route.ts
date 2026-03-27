import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const { id } = await ctx.params;
    const sql = getDb();
    const body = await request.json();
    const { name, description, audience_ids } = body;

    const [row] = await sql`
      UPDATE creative_territories SET
        name = COALESCE(${name?.trim() ?? null}, name),
        description = COALESCE(${description?.trim() ?? null}, description),
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    if (!row) return apiError(404, 'NOT_FOUND', 'Territory not found');

    if (audience_ids !== undefined) {
      await sql`DELETE FROM territory_audiences WHERE territory_id = ${id}`;
      for (const pid of audience_ids) {
        await sql`INSERT INTO territory_audiences (territory_id, persona_id) VALUES (${id}, ${pid}) ON CONFLICT DO NOTHING`;
      }
    }

    return NextResponse.json({ id: row.id, name: row.name, description: row.description });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update territory');
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const { id } = await ctx.params;
    const sql = getDb();
    const rows = await sql`DELETE FROM creative_territories WHERE id = ${id} RETURNING id`;
    if (!rows.length) return apiError(404, 'NOT_FOUND', 'Territory not found');
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete territory');
  }
}
