import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

function mapCopySetRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/copy-sets/[id] — get a single copy set.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      SELECT * FROM copy_sets WHERE id = ${id} LIMIT 1
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Copy set not found');
    }

    return NextResponse.json(mapCopySetRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to get copy set');
  }
}

/**
 * PUT /api/copy-sets/[id] — update a copy set.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();
    const body = await request.json();

    const { name, sort_order } = body;

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return apiError(400, 'VALIDATION_ERROR', 'name cannot be empty');
    }

    const rows = await sql`
      UPDATE copy_sets SET
        name = COALESCE(${name ? name.trim() : null}, name),
        sort_order = COALESCE(${sort_order ?? null}, sort_order),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Copy set not found');
    }

    return NextResponse.json(mapCopySetRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update copy set');
  }
}

/**
 * DELETE /api/copy-sets/[id] — delete a copy set.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      DELETE FROM copy_sets WHERE id = ${id} RETURNING id
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Copy set not found');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete copy set');
  }
}
