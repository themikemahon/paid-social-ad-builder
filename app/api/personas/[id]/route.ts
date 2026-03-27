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

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/personas/[id] — get a single persona.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      SELECT * FROM audience_personas
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Persona not found');
    }

    return NextResponse.json(mapPersonaRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to get persona');
  }
}

/**
 * PUT /api/personas/[id] — update a persona.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();
    const body = await request.json();

    const { name, demographics, pain_points, motivations, platform_behavior } = body;

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return apiError(400, 'VALIDATION_ERROR', 'name cannot be empty');
    }

    const rows = await sql`
      UPDATE audience_personas SET
        name = COALESCE(${name ? name.trim() : null}, name),
        demographics = COALESCE(
          ${demographics ? JSON.stringify(demographics) : null},
          demographics
        ),
        pain_points = COALESCE(${pain_points ?? null}, pain_points),
        motivations = COALESCE(${motivations ?? null}, motivations),
        platform_behavior = COALESCE(
          ${platform_behavior ? JSON.stringify(platform_behavior) : null},
          platform_behavior
        ),
        updated_at = NOW()
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      RETURNING *
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Persona not found');
    }

    return NextResponse.json(mapPersonaRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update persona');
  }
}

/**
 * DELETE /api/personas/[id] — delete a persona.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      DELETE FROM audience_personas
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Persona not found');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete persona');
  }
}
