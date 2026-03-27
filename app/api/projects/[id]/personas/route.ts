import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/personas — list persona IDs assigned to a project.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id } = await context.params;
    const sql = getDb();

    // Verify project belongs to workspace
    const project = await sql`
      SELECT id FROM projects
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `;
    if (project.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Project not found');
    }

    const rows = await sql`
      SELECT persona_id FROM project_personas
      WHERE project_id = ${id}
    `;

    return NextResponse.json(rows.map((r) => r.persona_id));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list project personas');
  }
}

/**
 * POST /api/projects/[id]/personas — assign a persona to a project.
 * Body: { persona_id: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();
    const body = await request.json();

    const { persona_id } = body;
    if (!persona_id) {
      return apiError(400, 'VALIDATION_ERROR', 'persona_id is required');
    }

    // Verify project belongs to workspace
    const project = await sql`
      SELECT id FROM projects
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `;
    if (project.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Project not found');
    }

    // Verify persona belongs to same workspace
    const persona = await sql`
      SELECT id FROM audience_personas
      WHERE id = ${persona_id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `;
    if (persona.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Persona not found in this workspace');
    }

    await sql`
      INSERT INTO project_personas (project_id, persona_id)
      VALUES (${id}, ${persona_id})
      ON CONFLICT (project_id, persona_id) DO NOTHING
    `;

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to assign persona to project');
  }
}

/**
 * DELETE /api/projects/[id]/personas — remove a persona from a project.
 * Body: { persona_id: string }
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();
    const body = await request.json();

    const { persona_id } = body;
    if (!persona_id) {
      return apiError(400, 'VALIDATION_ERROR', 'persona_id is required');
    }

    // Verify project belongs to workspace
    const project = await sql`
      SELECT id FROM projects
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `;
    if (project.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Project not found');
    }

    const rows = await sql`
      DELETE FROM project_personas
      WHERE project_id = ${id} AND persona_id = ${persona_id}
      RETURNING project_id
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Persona assignment not found');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to remove persona from project');
  }
}
