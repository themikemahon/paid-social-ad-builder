import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

function mapProjectRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    brief: row.brief ?? null,
    objectives: row.objectives ?? null,
    strategyOverrides:
      typeof row.strategy_overrides === 'string'
        ? JSON.parse(row.strategy_overrides)
        : (row.strategy_overrides ?? {}),
    enabledPlatforms:
      typeof row.enabled_platforms === 'string'
        ? JSON.parse(row.enabled_platforms)
        : (row.enabled_platforms ?? ['linkedin', 'meta', 'reddit']),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id] — get a single project.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      SELECT * FROM projects
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Project not found');
    }

    const personaRows = await sql`
      SELECT persona_id FROM project_personas
      WHERE project_id = ${id}
    `;

    return NextResponse.json({
      ...mapProjectRow(rows[0]),
      personaIds: personaRows.map((r) => r.persona_id),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to get project');
  }
}


/**
 * PUT /api/projects/[id] — update a project.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();
    const body = await request.json();

    const { name, brief, objectives, strategy_overrides, enabled_platforms } = body;

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return apiError(400, 'VALIDATION_ERROR', 'name cannot be empty');
    }

    const rows = await sql`
      UPDATE projects SET
        name = COALESCE(${name ? name.trim() : null}, name),
        brief = COALESCE(${brief ?? null}, brief),
        objectives = COALESCE(${objectives ?? null}, objectives),
        strategy_overrides = COALESCE(
          ${strategy_overrides ? JSON.stringify(strategy_overrides) : null},
          strategy_overrides
        ),
        enabled_platforms = COALESCE(
          ${enabled_platforms ?? null},
          enabled_platforms
        ),
        updated_at = NOW()
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      RETURNING *
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Project not found');
    }

    return NextResponse.json(mapProjectRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update project');
  }
}

/**
 * DELETE /api/projects/[id] — delete a project.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      DELETE FROM projects
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Project not found');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete project');
  }
}
