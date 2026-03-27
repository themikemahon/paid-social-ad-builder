import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();
    const rows = await sql`DELETE FROM generated_ads WHERE id = ${id} RETURNING id`;
    if (rows.length === 0) return apiError(404, 'NOT_FOUND', 'Ad not found');
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete ad');
  }
}
