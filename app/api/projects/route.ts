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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/projects — list projects in the current workspace.
 */
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const sql = getDb();

    const rows = await sql`
      SELECT * FROM projects
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
    `;

    return NextResponse.json(rows.map(mapProjectRow));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list projects');
  }
}


/**
 * POST /api/projects — create a project in the current workspace.
 * Editors and admins can create projects.
 */
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const sql = getDb();
    const body = await request.json();

    const { name, brief, objectives, strategy_overrides } = body;

    if (!name || (typeof name === 'string' && name.trim() === '')) {
      return apiError(400, 'VALIDATION_ERROR', 'name is required');
    }

    const rows = await sql`
      INSERT INTO projects (workspace_id, name, brief, objectives, strategy_overrides)
      VALUES (
        ${workspaceId},
        ${name.trim()},
        ${brief || null},
        ${objectives || null},
        ${JSON.stringify(strategy_overrides || {})}
      )
      RETURNING *
    `;

    return NextResponse.json(mapProjectRow(rows[0]), { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create project');
  }
}
