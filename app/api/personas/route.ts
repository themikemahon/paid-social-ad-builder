import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

function mapPersonaRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    demographics:
      typeof row.demographics === 'string'
        ? JSON.parse(row.demographics)
        : (row.demographics ?? {}),
    painPoints: row.pain_points ?? [],
    motivations: row.motivations ?? [],
    platformBehavior:
      typeof row.platform_behavior === 'string'
        ? JSON.parse(row.platform_behavior)
        : (row.platform_behavior ?? {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/personas — list audience personas in the current workspace.
 */
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const sql = getDb();

    const rows = await sql`
      SELECT * FROM audience_personas
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
    `;

    return NextResponse.json(rows.map(mapPersonaRow));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list personas');
  }
}

/**
 * POST /api/personas — create an audience persona in the current workspace.
 */
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const sql = getDb();
    const body = await request.json();

    const { name, demographics, pain_points, motivations, platform_behavior } = body;

    if (!name || (typeof name === 'string' && name.trim() === '')) {
      return apiError(400, 'VALIDATION_ERROR', 'name is required');
    }

    const rows = await sql`
      INSERT INTO audience_personas (
        workspace_id, name, demographics, pain_points, motivations, platform_behavior
      ) VALUES (
        ${workspaceId},
        ${name.trim()},
        ${JSON.stringify(demographics || {})},
        ${pain_points || []},
        ${motivations || []},
        ${JSON.stringify(platform_behavior || {})}
      )
      RETURNING *
    `;

    return NextResponse.json(mapPersonaRow(rows[0]), { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create persona');
  }
}
