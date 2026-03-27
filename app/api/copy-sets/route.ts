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

/**
 * GET /api/copy-sets?project_id=<uuid> — list copy sets for a project.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const projectId = request.nextUrl.searchParams.get('project_id');
    if (!projectId) {
      return apiError(400, 'VALIDATION_ERROR', 'project_id query parameter is required');
    }

    const sql = getDb();
    const rows = await sql`
      SELECT * FROM copy_sets
      WHERE project_id = ${projectId}
      ORDER BY sort_order ASC, created_at ASC
    `;

    return NextResponse.json(rows.map(mapCopySetRow));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list copy sets');
  }
}

/**
 * POST /api/copy-sets — create a copy set within a project.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const sql = getDb();
    const body = await request.json();

    const { project_id, name, sort_order } = body;

    if (!project_id) {
      return apiError(400, 'VALIDATION_ERROR', 'project_id is required');
    }
    if (!name || (typeof name === 'string' && name.trim() === '')) {
      return apiError(400, 'VALIDATION_ERROR', 'name is required');
    }

    const rows = await sql`
      INSERT INTO copy_sets (project_id, name, sort_order)
      VALUES (${project_id}, ${name.trim()}, ${sort_order ?? 0})
      RETURNING *
    `;

    return NextResponse.json(mapCopySetRow(rows[0]), { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create copy set');
  }
}
